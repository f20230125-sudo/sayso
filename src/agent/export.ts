import type { Turn } from "@/store/conversationSlice";
import { describeIntent } from "./describe";
import type { Json } from "./types";

// A turn written out so another program can read it: what was said, how it was
// understood, the plan, every call, and when each thing happened. This is what
// Hindsight (an observer for agents) is sent when the "Open in Hindsight"
// button in the "How it worked" panel is pressed.
//
// It is plain JSON. The format is named and numbered, so a reader can tell what
// it holds, and refuse what it does not know.

export const ENVELOPE_FORMAT = "hindsight/run";
export const ENVELOPE_VERSION = 1;

/** The most one piece of data may weigh once written out. A seat map of a big aircraft is a few thousand characters. */
const MAX_PIECE = 20_000;

function limited(value: Json | null | undefined): Json | null {
  if (value === undefined || value === null) return null;
  const text = JSON.stringify(value);
  return text.length > MAX_PIECE ? { truncated: true, characters: text.length } : value;
}

export type SaysoStep = {
  id: string;
  kind: "say" | "set" | "tool" | "show";
  /** The line said, for a "say" step, once it has been said. */
  text?: string | null;
  label?: string;
  tool?: string;
  widget?: string;
  /** Whether the run stopped at this component to wait for the traveller. */
  waits?: boolean;
  /** What the traveller answered, once they have. */
  answer?: Json | null;
};

export type SaysoCall = {
  stepId: string;
  tool: string;
  method: string;
  url: string;
  status: number;
  ms: number;
  body: Json | null;
  result: Json | null;
  failure: { code: string; message: string } | null;
};

export type SaysoRun = {
  id: string;
  words: string;
  /** When the words were said. Null for a turn saved before this was kept. */
  startedAt: string | null;
  understanding: string;
  brain: "rules" | "model";
  model: string | null;
  understoodMs: number;
  intents: { journey: string; details: { name: string; value: string }[] }[];
  /** Null for a turn that led to no run: small talk, or words that were not understood. */
  status: "running" | "waiting" | "done" | "failed" | "stopped" | null;
  failure: { stepId: string; code: string; message: string } | null;
  steps: SaysoStep[];
  calls: SaysoCall[];
  /** What happened and when (milliseconds since 1970), in order. */
  log: { at: number; type: string; stepId: string | null }[];
  marks: { words: string; beforeStep: string | null; reply: string | null; by: string | null }[];
  checks: { label: string; pass: boolean }[];
  reply: string | null;
  replyBy: string | null;
  closing: string | null;
};

export type SaysoEnvelope = {
  format: typeof ENVELOPE_FORMAT;
  version: typeof ENVELOPE_VERSION;
  app: "sayso";
  data: SaysoRun;
};

export function exportTurn(turn: Turn): SaysoEnvelope {
  const run = turn.run;
  const steps: SaysoStep[] = (run?.steps ?? []).map((step, index) => {
    switch (step.kind) {
      case "say": {
        const said = run?.results[step.id];
        return { id: step.id, kind: "say", text: typeof said === "string" ? said : null };
      }
      case "set":
        return { id: step.id, kind: "set", label: step.label };
      case "tool":
        return { id: step.id, kind: "tool", label: step.label, tool: step.tool };
      case "show":
        return {
          id: step.id,
          kind: "show",
          label: step.label,
          widget: step.widget,
          waits: step.waits,
          // A component the traveller has answered is behind the step the run has reached.
          answer: step.waits && run && index < run.at ? limited(run.results[step.id]) : null,
        };
    }
  });

  return {
    format: ENVELOPE_FORMAT,
    version: ENVELOPE_VERSION,
    app: "sayso",
    data: {
      id: turn.id,
      words: turn.words,
      startedAt: turn.startedAt,
      understanding: turn.understanding.kind,
      brain: turn.brain,
      model: turn.model,
      understoodMs: turn.understoodMs,
      intents: turn.intents.map(describeIntent),
      status: run?.status ?? null,
      failure: run?.failure ?? null,
      steps,
      calls: turn.calls.map(({ stepId, call, result, failure }) => ({
        stepId,
        tool: call.tool,
        method: call.method,
        url: call.url,
        status: call.status,
        ms: call.ms,
        body: limited(call.body),
        result: limited(result),
        failure,
      })),
      log: turn.log.map(({ at, type, stepId }) => ({ at, type, stepId })),
      marks: turn.marks.map((mark) => ({ words: mark.words, beforeStep: mark.beforeStep, reply: mark.reply ?? null, by: mark.by ?? null })),
      checks: run?.checks ?? [],
      reply: turn.reply,
      replyBy: turn.replyBy,
      closing: turn.closing,
    },
  };
}
