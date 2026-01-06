import type { IsoDate } from "@/airline/dates";
import type { Account, SeatKind } from "@/airline/schema";
import type { WidgetType } from "@/widgets/specs";
import type { Json } from "./reference";

// The agent works in four steps, each with its own shape of data:
//
//   understand   words            ->  Understanding (intents)
//   plan         intents          ->  Plan (steps)
//   run          steps            ->  RunEvents, one per thing that happens
//   check        what happened    ->  Checks against what was asked
//
// Everything here is plain data. Nothing in src/agent knows about React or
// Redux, so all of it can be tested without a browser.

export type { Json };

// --- Understand ---------------------------------------------------------------

/** Which trip a request is about, as far as the words say. */
export type TripRef = {
  /** The booking reference, such as "K7QM2P". */
  code?: string;
  /** The airport at the far end, such as "LHR". */
  place?: string;
  /** 0 for Sunday up to 6 for Saturday. */
  weekday?: number;
  date?: IsoDate;
  /** "my next flight" */
  next?: boolean;
};

/** When to fly: any day in a range (one day when both ends match), or a shift from the current date. */
export type DateWish = { from: IsoDate; to: IsoDate } | { shiftDays: number };

/** One thing the traveller wants, with the details they gave. A sentence can hold several. */
export type Intent =
  | { journey: "trips" }
  | { journey: "seat"; trip?: TripRef; wish?: SeatKind; seat?: string };

export type JourneyName = Intent["journey"];

export const JOURNEY_NAMES: Record<JourneyName, string> = {
  trips: "See my trips",
  seat: "Choose a seat",
};

/** Which of the two understood the words. */
export type Brain = "rules" | "model";

export type Understanding =
  /** A new request. */
  | { kind: "request"; intents: Intent[] }
  /** A change to the journey in progress: "make it an aisle seat instead". */
  | { kind: "amend"; intents: Intent[] }
  /** The words answer the component that is waiting: "14A", "yes". */
  | { kind: "answer"; answer: Json }
  /** "never mind" */
  | { kind: "abandon" }
  /** Small talk the desk can answer without doing anything. */
  | { kind: "chat"; about: "hello" | "thanks" | "help" }
  /** Understood, but it cannot be done, and why: "Seat 12C is taken." */
  | { kind: "cannot"; why: string }
  | { kind: "unknown" };

/** What the understander may look at besides the words. */
export type Context = {
  today: IsoDate;
  account: Account;
  /** The journey in progress, when a component is waiting for the traveller. */
  active?: { intents: Intent[]; widget: WidgetType; props: Json };
};

// --- Plan ---------------------------------------------------------------------

export type ToolName = "seatMap" | "quote" | "order";

export type Step =
  /** A short line of text. May hold references. */
  | { id: string; kind: "say"; text: string }
  /** Something already known when the plan was made, such as which trip is meant. */
  | { id: string; kind: "set"; value: Json; label: string }
  /** A call to the airline's API. */
  | { id: string; kind: "tool"; tool: ToolName; args: Json; label: string }
  /** A component on screen. When it waits, the run pauses until the traveller answers. */
  | { id: string; kind: "show"; widget: WidgetType; props: Json; waits: boolean; label: string };

/** Something the result must satisfy for the request to count as met. */
export type Expectation =
  | { kind: "seat-kind"; wish: SeatKind; seatStep: string }
  | { kind: "seat-on-booking"; seatStep: string }
  | { kind: "charged-as-quoted" };

export type Plan = { steps: Step[]; expectations: Expectation[] };

// --- Run ----------------------------------------------------------------------

/** One call to the API, as it went. Kept so the "How it worked" panel can show it. */
export type ToolCall = {
  tool: ToolName;
  method: "GET" | "POST";
  url: string;
  body?: Json;
  status: number;
  ms: number;
};

export type Failure = { code: string; message: string };

export type Check = { label: string; pass: boolean };

export type RunStatus = "running" | "waiting" | "done" | "failed" | "stopped";

/**
 * Where a run has got to. It is plain data on purpose: it sits in Redux and in
 * the browser's storage, so a run that is waiting for the traveller is still
 * there, waiting, after the page is reloaded.
 */
export type RunState = {
  steps: Step[];
  expectations: Expectation[];
  /** The step to run next, or the one being waited on. */
  at: number;
  /** What each finished step produced, by step id. */
  results: Record<string, Json>;
  status: RunStatus;
  failure?: Failure & { stepId: string };
  checks: Check[];
};

export type RunEvent =
  | { type: "said"; stepId: string; text: string }
  | { type: "set"; stepId: string; value: Json }
  | { type: "tool-started"; stepId: string; tool: ToolName; label: string }
  | { type: "tool-finished"; stepId: string; call: ToolCall; result: Json }
  | { type: "shown"; stepId: string; widget: WidgetType; props: Json; waits: boolean }
  | { type: "answered"; stepId: string; answer: Json }
  | { type: "failed"; stepId: string; failure: Failure; call?: ToolCall }
  | { type: "checked"; checks: Check[] }
  | { type: "finished" }
  | { type: "stopped" }
  /** A run that failed is being tried again from the step that failed. */
  | { type: "resumed" };

/** What the run needs from outside. Tests pass stand-ins for all of it. */
export type Deps = {
  fetch: typeof fetch;
  signal: AbortSignal;
  /** Milliseconds, for timing calls. */
  now: () => number;
};
