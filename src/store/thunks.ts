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
import { talkPrompt } from "@/agent/talk";
import type { Brain, Context, Json, Understanding } from "@/agent/types";
import { understandByModel } from "@/agent/understand/model";
import { mergeIntents, understandByRules } from "@/agent/understand/rules";
import { ModelError, complete, stream } from "@/ai/chat";
import { loadAiConfig, toAiSettings, type AiSettings } from "@/ai/settings";
import { localDay } from "@/airline/dates";
import type { Booking, OrderResult } from "@/airline/schema";
import { accountActions } from "./accountSlice";
import { conversationActions, type Mark, type Turn } from "./conversationSlice";
import { forget, load } from "./persist";
import { settingsActions } from "./settingsSlice";
import type { AppThunk, RootState } from "./store";

// What happens when the traveller says something or touches a component.
//
// The agent itself (src/agent) knows nothing about Redux. These thunks are
// the join: they hand the agent what it needs from the store, and turn each
// event it reports into an action.

/** The key under which the call that is understanding the latest words can be stopped. */
const UNDERSTANDING = "understanding";

/** The turn whose journey is waiting for the traveller, if the latest one is. */
export function activeTurnOf(state: RootState): Turn | null {
  const last = state.conversation.turns.at(-1);
  return last?.run?.status === "waiting" ? last : null;
}

/** Whether the desk is busy with something that can be stopped. */
export function isBusy(state: RootState): boolean {
  const last = state.conversation.turns.at(-1);
  return state.conversation.pending !== null || last?.run?.status === "running" || last?.streaming === true;
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
  dispatch(settingsActions.aiConfigSet(loadAiConfig(extra.storage)));
};

/** Fresh trips and an empty conversation. The model settings are the visitor's own and are kept. */
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

/** Stop whatever the desk is in the middle of: understanding, a call, or a reply still arriving. */
export const stop = (): AppThunk => (dispatch, getState, extra) => {
  extra.controllers.get(UNDERSTANDING)?.abort();
  const last = getState().conversation.turns.at(-1);
  if (!last) return;
  if (last.streaming) {
    extra.controllers.get(last.id)?.abort();
    extra.controllers.delete(last.id);
    dispatch(conversationActions.replyEnded({ turnId: last.id }));
  } else if (last.run?.status === "running") {
    dispatch(leave(last.id, STOPPED));
  }
};

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

type Understood = { understanding: Understanding; brain: Brain; model: string | null; understoodMs: number };

function newTurn(words: string, understood: Understood): Turn {
  turnCount += 1;
  return {
    id: `turn-${Date.now().toString(36)}-${turnCount}`,
    words,
    ...understood,
    intents: [],
    run: null,
    reply: null,
    replyBy: null,
    streaming: false,
    marks: [],
    calls: [],
    closing: null,
  };
}

/**
 * Work out what the words mean. The rules go first: they cost nothing and
 * answer at once. Only what they cannot read is put to a model, and only when
 * the visitor has given one. Returns null when the visitor stopped it.
 */
const understand =
  (words: string, context: Context): AppThunk<Promise<(Understood & { trouble: string | null }) | null>> =>
  async (dispatch, getState, extra) => {
    const began = extra.clock();
    const took = () => Math.round(extra.clock() - began);
    const byRules = understandByRules(words, context);
    const ai = toAiSettings(getState().settings.ai);
    if (byRules.kind !== "unknown" || !ai) return { understanding: byRules, brain: "rules", model: null, understoodMs: took(), trouble: null };

    // The words go on the page at once; the model's reading follows.
    const controller = new AbortController();
    extra.controllers.set(UNDERSTANDING, controller);
    dispatch(conversationActions.pendingSet({ words }));
    try {
      const byModel = await understandByModel(words, context, (messages) =>
        complete(ai, messages, { fetch: extra.fetch, signal: controller.signal }, { json: true }),
      );
      // A reply that did not hold up after one repair is treated as "not understood".
      return { understanding: byModel ?? { kind: "unknown" }, brain: "model", model: ai.model, understoodMs: took(), trouble: null };
    } catch (problem) {
      if (controller.signal.aborted) return null;
      const trouble = problem instanceof ModelError ? problem.message : "The model could not be asked.";
      return { understanding: { kind: "unknown" }, brain: "rules", model: null, understoodMs: took(), trouble };
    } finally {
      extra.controllers.delete(UNDERSTANDING);
      dispatch(conversationActions.pendingSet(null));
    }
  };

/** Answer a question in words, a few at a time as they arrive from the model. */
const talk =
  (turnId: string, words: string, context: Context, ai: AiSettings): AppThunk<Promise<void>> =>
  async (dispatch, _getState, extra) => {
    const controller = new AbortController();
    extra.controllers.set(turnId, controller);
    dispatch(conversationActions.turnStreaming({ turnId }));
    const messages = [
      { role: "system" as const, content: talkPrompt(context) },
      { role: "user" as const, content: words },
    ];
    try {
      await stream(ai, messages, { fetch: extra.fetch, signal: controller.signal }, (piece) => dispatch(conversationActions.replyGrew({ turnId, piece })));
      dispatch(conversationActions.replyEnded({ turnId }));
    } catch (problem) {
      // Stopped by the visitor: what has arrived stays, and `stop` has ended it.
      if (controller.signal.aborted) return;
      dispatch(conversationActions.replyEnded({ turnId, instead: problem instanceof ModelError ? problem.message : "The model could not answer that." }));
    } finally {
      if (extra.controllers.get(turnId) === controller) extra.controllers.delete(turnId);
    }
  };

/** The traveller said something. */
export const ask =
  (said: string): AppThunk<Promise<void>> =>
  async (dispatch, getState, extra) => {
    const words = said.trim();
    const { account } = getState().account;
    if (words === "" || !account || isBusy(getState())) return;

    const today = localDay(extra.now());
    const now = extra.now().toISOString();
    const active = activeTurnOf(getState());
    const waiting = active ? waitingStep(active.run) : null;
    const context: Context = {
      today,
      account,
      ...(active?.run && waiting ? { active: { intents: active.intents, widget: waiting.widget, props: fill(waiting.props, active.run.results) } } : {}),
    };

    const understood = await dispatch(understand(words, context));
    if (!understood) return;
    const { understanding, trouble, ...how } = understood;
    const ai = toAiSettings(getState().settings.ai);
    const notUnderstood = (line: string) => (trouble ? `${line} The model could not help: ${trouble}` : line);

    // Words that belong to the journey in progress stay inside its turn.
    if (active?.run && waiting) {
      const turnId = active.id;
      const mark = (beforeStep: string | null, more: Partial<Mark> = {}) =>
        dispatch(conversationActions.markAdded({ turnId, mark: { words, beforeStep, ...more } }));

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
          const changed = replan(active.run, planFor(intents, { today, now, account, focus: focusOf(getState()) }));
          if (changed.changedAt === null) {
            mark(null, { reply: ALREADY_SO });
            return;
          }
          mark(changed.run.steps[changed.changedAt]?.id ?? null);
          dispatch(conversationActions.turnReplanned({ turnId, intents, run: changed.run }));
          if (changed.run.status === "running") await dispatch(drive(turnId));
          return;
        }
        case "chat":
          mark(null, { reply: chatReply(understanding.about) });
          return;
        case "cannot":
          mark(null, { reply: understanding.why });
          return;
        case "say":
          mark(null, { reply: understanding.text });
          return;
        case "talk":
          if (ai) {
            // The question is answered under the journey, which stays where it is.
            mark(null, { reply: "", by: ai.model });
            await dispatch(talk(turnId, words, context, ai));
            return;
          }
          mark(null, { reply: NOT_UNDERSTOOD_WHILE_WAITING });
          return;
        case "unknown":
          mark(null, { reply: notUnderstood(NOT_UNDERSTOOD_WHILE_WAITING) });
          return;
        case "request":
          // Something else entirely. The journey in progress is left where it is.
          dispatch(leave(turnId, LEFT_UNFINISHED));
          break;
      }
    }

    const turn = newTurn(words, { understanding, ...how });
    switch (understanding.kind) {
      case "request":
      case "amend": {
        const plan = planFor(understanding.intents, { today, now, account, focus: focusOf(getState()) });
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
      case "say":
        turn.reply = understanding.text;
        break;
      case "talk":
        turn.reply = ai ? "" : NOT_UNDERSTOOD;
        turn.replyBy = ai ? ai.model : null;
        break;
      case "answer":
      case "abandon":
        turn.reply = NOTHING_IN_PROGRESS;
        break;
      case "unknown":
        turn.reply = notUnderstood(NOT_UNDERSTOOD);
        break;
    }

    dispatch(conversationActions.turnAdded(turn));
    if (turn.run) await dispatch(drive(turn.id));
    else if (understanding.kind === "talk" && ai) await dispatch(talk(turn.id, words, context, ai));
  };
