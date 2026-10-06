import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { reduceRun } from "@/agent/run";
import type { Brain, Failure, Intent, Json, RunEvent, RunState, ToolCall, Understanding } from "@/agent/types";

// The conversation: one turn per thing the traveller set out to do.
//
// A turn starts with their words and holds the run those words led to. Words
// said later that belong to the same journey ("aisle instead", "14A", "yes")
// do not start a new turn. They are kept as marks inside it, each remembering
// where in the plan it was said, so the page can show them in the right place.

/** Something the traveller said partway through a journey. */
export type Mark = {
  words: string;
  /** The step that came next when this was said. The words are shown just before it. */
  beforeStep: string | null;
  /** A plain line in answer, when the words changed nothing: "That is already how it is set." */
  reply?: string;
  /** The model that wrote the reply, when one did. */
  by?: string;
};

/** One call to the API, kept for the "How it worked" panel. */
export type CallRecord = { stepId: string; call: ToolCall; result: Json | null; failure: Failure | null };

export type Turn = {
  id: string;
  words: string;
  understanding: Understanding;
  brain: Brain;
  /** The model that was asked, when the rules could not read the words. */
  model: string | null;
  /** How long understanding took, in milliseconds. */
  understoodMs: number;
  /** What is being done now: the first request with any later changes folded in. */
  intents: Intent[];
  /** Null when the words led to no plan: small talk, or something not understood. */
  run: RunState | null;
  /** A plain line in reply, for turns with no run. */
  reply: string | null;
  /** The model that wrote the reply, when one did. Null for the desk's own fixed lines. */
  replyBy: string | null;
  /** The reply is still arriving, a few words at a time. */
  streaming: boolean;
  marks: Mark[];
  calls: CallRecord[];
  /** A last line for a journey that was left: "Left unfinished. Nothing was changed." */
  closing: string | null;
};

export type ConversationState = {
  turns: Turn[];
  /** Words a model is being asked about. They are on the page already, with nothing under them yet. */
  pending: { words: string } | null;
};

const initialState: ConversationState = { turns: [], pending: null };

const conversationSlice = createSlice({
  name: "conversation",
  initialState,
  reducers: {
    conversationLoaded(_state, action: PayloadAction<Turn[]>) {
      return { turns: action.payload, pending: null };
    },
    pendingSet(state, action: PayloadAction<{ words: string } | null>) {
      state.pending = action.payload;
    },
    /** More of a reply has arrived from the model. */
    replyGrew(state, action: PayloadAction<{ turnId: string; piece: string }>) {
      const turn = state.turns.find((entry) => entry.id === action.payload.turnId);
      if (!turn) return;
      // Words said partway through a journey are answered under those words.
      const mark = turn.marks.at(-1);
      if (turn.run && mark) mark.reply = (mark.reply ?? "") + action.payload.piece;
      else turn.reply = (turn.reply ?? "") + action.payload.piece;
    },
    /** The reply has finished arriving, or failed: `instead` then replaces whatever came. */
    replyEnded(state, action: PayloadAction<{ turnId: string; instead?: string }>) {
      const turn = state.turns.find((entry) => entry.id === action.payload.turnId);
      if (!turn) return;
      turn.streaming = false;
      if (action.payload.instead === undefined) return;
      const mark = turn.marks.at(-1);
      if (turn.run && mark) {
        mark.reply = action.payload.instead;
        delete mark.by;
      } else {
        turn.reply = action.payload.instead;
        turn.replyBy = null;
      }
    },
    turnStreaming(state, action: PayloadAction<{ turnId: string }>) {
      const turn = state.turns.find((entry) => entry.id === action.payload.turnId);
      if (turn) turn.streaming = true;
    },
    turnAdded(state, action: PayloadAction<Turn>) {
      state.turns.push(action.payload);
    },
    runEvent(state, action: PayloadAction<{ turnId: string; event: RunEvent }>) {
      const turn = state.turns.find((entry) => entry.id === action.payload.turnId);
      if (!turn?.run) return;
      const { event } = action.payload;
      turn.run = reduceRun(turn.run, event);
      if (event.type === "tool-finished") turn.calls.push({ stepId: event.stepId, call: event.call, result: event.result, failure: null });
      if (event.type === "failed" && event.call) turn.calls.push({ stepId: event.stepId, call: event.call, result: null, failure: event.failure });
    },
    /** The traveller said something that belongs to this turn's journey. */
    markAdded(state, action: PayloadAction<{ turnId: string; mark: Mark }>) {
      state.turns.find((entry) => entry.id === action.payload.turnId)?.marks.push(action.payload.mark);
    },
    /** The journey was changed partway: a new plan, picked up from where it first differs. */
    turnReplanned(state, action: PayloadAction<{ turnId: string; intents: Intent[]; run: RunState }>) {
      const turn = state.turns.find((entry) => entry.id === action.payload.turnId);
      if (!turn) return;
      turn.intents = action.payload.intents;
      turn.run = action.payload.run;
    },
    turnClosed(state, action: PayloadAction<{ turnId: string; closing: string }>) {
      const turn = state.turns.find((entry) => entry.id === action.payload.turnId);
      if (!turn?.run) return;
      turn.run = reduceRun(turn.run, { type: "stopped" });
      turn.closing = action.payload.closing;
    },
    conversationCleared() {
      return initialState;
    },
  },
});

export const conversationActions = conversationSlice.actions;
export const conversationReducer = conversationSlice.reducer;
