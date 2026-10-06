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
  /** The flight number, such as "JN 203". */
  flight?: string;
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
  | { journey: "status"; trip?: TripRef }
  | { journey: "change-flight"; trip?: TripRef; when?: DateWish }
  | { journey: "seat"; trip?: TripRef; wish?: SeatKind; seat?: string }
  /** `add` is how many more checked bags, when the words said. */
  | { journey: "bags"; trip?: TripRef; add?: number }
  | { journey: "check-in"; trip?: TripRef }
  | { journey: "cancel"; trip?: TripRef }
  /** `from` and `to` are airport codes. */
  | { journey: "book"; from?: string; to?: string; when?: DateWish }
  /** A question about the traveller's own account, answered from ready-made views of it. */
  | { journey: "insight"; views: ViewName[] };

/** The views of the account an answer can be built from. Each is worked out by code (see views.ts). */
export const VIEW_NAMES = ["spending", "spending-by-month", "spending-by-route", "payments", "upcoming"] as const;
export type ViewName = (typeof VIEW_NAMES)[number];

export type JourneyName = Intent["journey"];

export const JOURNEY_NAMES: Record<JourneyName, string> = {
  trips: "See my trips",
  status: "Flight status",
  "change-flight": "Change a flight",
  seat: "Choose a seat",
  bags: "Add bags",
  "check-in": "Check in",
  cancel: "Cancel and refund",
  book: "Book a flight",
  insight: "Answer from my account",
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
  /** A question the rules can answer outright, with the line that answers it. */
  | { kind: "say"; text: string }
  /** A question that needs an answer in words, not an action. Only a model says this. */
  | { kind: "talk" }
  /** Understood, but it cannot be done, and why: "Seat 12C is taken." */
  | { kind: "cannot"; why: string }
  /**
   * Not understood. `hint` is a better thing to say than "I did not understand
   * that", when the rules can tell what the trouble was.
   */
  | { kind: "unknown"; hint?: string };

/** What the understander may look at besides the words. */
export type Context = {
  today: IsoDate;
  account: Account;
  /** The journey in progress, when a component is waiting for the traveller. */
  active?: { intents: Intent[]; widget: WidgetType; props: Json };
};

// --- Plan ---------------------------------------------------------------------

export type ToolName = "calendar" | "searchFlights" | "seatMap" | "status" | "quote" | "order";

export type Step =
  /** A short line of text. May hold references. */
  | { id: string; kind: "say"; text: string }
  /** Something that needs no call and no question, such as which trip is meant. May hold references. */
  | { id: string; kind: "set"; value: Json; label: string }
  /** A call to the airline's API. */
  | { id: string; kind: "tool"; tool: ToolName; args: Json; label: string }
  /** A component on screen. When it waits, the run pauses until the traveller answers. */
  | { id: string; kind: "show"; widget: WidgetType; props: Json; waits: boolean; label: string };

/** Something the result must satisfy for the request to count as met. */
export type Expectation =
  | { kind: "seat-kind"; wish: SeatKind; seatStep: string }
  | { kind: "seat-on-booking"; seatStep: string }
  | { kind: "date-within"; from: IsoDate; to: IsoDate; flightStep: string }
  | { kind: "flight-on-booking"; flightStep: string }
  | { kind: "goes-to"; place: string; flightStep: string }
  | { kind: "bags-on-booking"; bagsStep: string }
  | { kind: "checked-in" }
  | { kind: "cancelled" }
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
