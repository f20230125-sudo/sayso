import { planFor } from "@/agent/plan";
import { fill } from "@/agent/reference";
import { replan } from "@/agent/replan";
import {
  ALREADY_SO,
  LEFT_UNFINISHED,
  NOTHING_IN_PROGRESS,
  NOT_UNDERSTOOD,
  NOT_UNDERSTOOD_WHILE_WAITING,
  STOPPED,
  chatReply,
} from "@/agent/replies";
import { advance, answerEvent, startRun, waitingStep } from "@/agent/run";
import type { Context, Json, Understanding } from "@/agent/types";
import { mergeIntents, understandByRules } from "@/agent/understand/rules";
import { localDay } from "@/airline/dates";
import type { Booking, OrderResult } from "@/airline/schema";
import { accountActions } from "./accountSlice";
import { conversationActions, type Turn } from "./conversationSlice";
import { forget, load } from "./persist";
import type { AppThunk, RootState } from "./store";

// What happens when the traveller says something or touches a component.
//
// The agent itself (src/agent) knows nothing about Redux. These thunks are
// the join: they hand the agent what it needs from the store, and turn each
// event it reports into an action.

/** The turn whose journey is waiting for the traveller, if the latest one is. */
export function activeTurnOf(state: RootState): Turn | null {
  const last = state.conversation.turns.at(-1);
  return last?.run?.status === "waiting" ? last : null;
}

/** The booking the conversation last dealt with: the one a request means when it names none. */
function focusOf(state: RootState): string | null {
  for (const turn of [...state.conversation.turns].reverse()) {
    const results = turn.run?.results;
    const booking = (results?.order as { booking?: Booking } | undefined)?.booking ?? (results?.trip as { booking?: Booking } | undefined)?.booking;
    if (booking) return booking.code;
  }
  return null;
}

/** Read what the browser remembers, or start a fresh demo. */
export const start = (): AppThunk => (dispatch, _getState, extra) => {
  const saved = load(extra.storage, localDay(extra.now()));
  dispatch(accountActions.accountLoaded(saved.account));
  dispatch(conversationActions.conversationLoaded(saved.turns));
};

export const startOver = (): AppThunk => (dispatch, _getState, extra) => {
  for (const controller of extra.controllers.values()) controller.abort();
  extra.controllers.clear();
  forget(extra.storage);
  dispatch(start());
};

/** Run a turn's plan from where it stands until it finishes, fails or waits. */
export const drive =
  (turnId: string): AppThunk<Promise<void>> =>
  async (dispatch, getState, extra) => {
    const run = getState().conversation.turns.find((turn) => turn.id === turnId)?.run;
    if (!run) return;

    // Whatever was driving this turn before is out of date. Its events are
    // ignored from here on, because it is no longer the turn's controller.
    extra.controllers.get(turnId)?.abort();
    const controller = new AbortController();
    extra.controllers.set(turnId, controller);

    await advance(run, { fetch: extra.fetch, signal: controller.signal, now: extra.clock }, (event) => {
      if (extra.controllers.get(turnId) !== controller) return;
      dispatch(conversationActions.runEvent({ turnId, event }));
      // The server keeps no bookings, so the new state of this one is kept here.
      if (event.type === "tool-finished" && event.call.tool === "order") dispatch(accountActions.orderPlaced(event.result as OrderResult));
    });

    if (extra.controllers.get(turnId) === controller) extra.controllers.delete(turnId);
  };

/** Stop driving a turn and leave its journey where it is. */
const leave =
  (turnId: string, closing: string): AppThunk =>
  (dispatch, _getState, extra) => {
    extra.controllers.get(turnId)?.abort();
    extra.controllers.delete(turnId);
    dispatch(conversationActions.turnClosed({ turnId, closing }));
  };

export const stop = (turnId: string): AppThunk => leave(turnId, STOPPED);

/** The traveller chose something on a component. */
export const answer =
  (turnId: string, stepId: string, value: Json): AppThunk<Promise<void>> =>
  async (dispatch, getState) => {
    const run = getState().conversation.turns.find((turn) => turn.id === turnId)?.run;
    const event = run ? answerEvent(run, stepId, value) : null;
    if (!event) return;
    dispatch(conversationActions.runEvent({ turnId, event }));
    await dispatch(drive(turnId));
  };

let turnCount = 0;

function newTurn(words: string, understanding: Understanding, understoodMs: number): Turn {
  turnCount += 1;
  return {
    id: `turn-${Date.now().toString(36)}-${turnCount}`,
    words,
    understanding,
    brain: "rules",
    understoodMs,
    intents: [],
    run: null,
    reply: null,
    marks: [],
    calls: [],
    closing: null,
  };
}

/** The traveller said something. */
export const ask =
  (said: string): AppThunk<Promise<void>> =>
  async (dispatch, getState, extra) => {
    const words = said.trim();
    const { account } = getState().account;
    if (words === "" || !account) return;

    const today = localDay(extra.now());
    const active = activeTurnOf(getState());
    const waiting = active ? waitingStep(active.run) : null;
    const context: Context = {
      today,
      account,
      ...(active?.run && waiting ? { active: { intents: active.intents, widget: waiting.widget, props: fill(waiting.props, active.run.results) } } : {}),
    };

    const began = extra.clock();
    const understanding = understandByRules(words, context);
    const understoodMs = Math.round(extra.clock() - began);

    // Words that belong to the journey in progress stay inside its turn.
    if (active?.run && waiting) {
      const turnId = active.id;
      const mark = (beforeStep: string | null, reply?: string) =>
        dispatch(conversationActions.markAdded({ turnId, mark: { words, beforeStep, ...(reply ? { reply } : {}) } }));

      switch (understanding.kind) {
        case "answer":
          mark(active.run.steps[active.run.at + 1]?.id ?? null);
          await dispatch(answer(turnId, waiting.id, understanding.answer));
          return;
        case "abandon":
          mark(null);
          dispatch(leave(turnId, LEFT_UNFINISHED));
          return;
        case "amend": {
          const intents = mergeIntents(active.intents, understanding.intents);
          const changed = replan(active.run, planFor(intents, { today, account, focus: focusOf(getState()) }));
          if (changed.changedAt === null) {
            mark(null, ALREADY_SO);
            return;
          }
          mark(changed.run.steps[changed.changedAt]?.id ?? null);
          dispatch(conversationActions.turnReplanned({ turnId, intents, run: changed.run }));
          if (changed.run.status === "running") await dispatch(drive(turnId));
          return;
        }
        case "chat":
          mark(null, chatReply(understanding.about));
          return;
        case "cannot":
          mark(null, understanding.why);
          return;
        case "unknown":
          mark(null, NOT_UNDERSTOOD_WHILE_WAITING);
          return;
        case "request":
          // Something else entirely. The journey in progress is left where it is.
          dispatch(leave(turnId, LEFT_UNFINISHED));
          break;
      }
    }

    const turn = newTurn(words, understanding, understoodMs);
    switch (understanding.kind) {
      case "request":
      case "amend": {
        const plan = planFor(understanding.intents, { today, account, focus: focusOf(getState()) });
        turn.intents = understanding.intents;
        if (plan.steps.length > 0) turn.run = startRun(plan);
        else turn.reply = NOT_UNDERSTOOD;
        break;
      }
      case "chat":
        turn.reply = chatReply(understanding.about);
        break;
      case "cannot":
        turn.reply = understanding.why;
        break;
      case "answer":
      case "abandon":
        turn.reply = NOTHING_IN_PROGRESS;
        break;
      case "unknown":
        turn.reply = NOT_UNDERSTOOD;
        break;
    }

    dispatch(conversationActions.turnAdded(turn));
    if (turn.run) await dispatch(drive(turn.id));
  };
