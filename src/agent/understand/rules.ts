import { HOME, placesIn } from "@/airline/places";
import type { Booking, SeatKind, SeatMap } from "@/airline/schema";
import { findSeat } from "@/airline/seats";
import { matchTrips } from "../plan";
import type { Context, Intent, Json, TripRef, Understanding } from "../types";
import { findDates, type FoundDate } from "./dates";

// The first of the four steps, done with rules and no model.
//
// The rules know the journeys the desk offers and the ways people ask for
// them. They cost nothing and answer at once, so every visitor gets a working
// desk without a key. What they cannot read is handed to a model when the
// visitor has given one (see model.ts), and is otherwise answered honestly:
// "I did not understand that."

/** Journeys that end in an order, and so can be added to one another. */
const ORDER_JOURNEYS: ReadonlySet<Intent["journey"]> = new Set(["seat"]);

const SEAT_WISHES: [RegExp, SeatKind][] = [
  [/\b(extra |more )?leg ?room\b|\bexit row\b|\bmore (space|room)\b/, "legroom"],
  [/\bwindow\b/, "window"],
  [/\baisle\b/, "aisle"],
  [/\b(at|near|in|up) the front\b|\bfront (row|seat)\b|\bup front\b/, "front"],
  [/\bmiddle\b/, "middle"],
];

// No space allowed inside: "15 a window seat" must not read as seat 15A.
const SEAT_CODE = /\b(\d{1,2})([a-f])\b/;

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a sentence into the separate things it asks for. */
function clauses(text: string): string[] {
  return text
    .split(/\s*(?:,|;|\band then\b|\bthen\b|\band also\b|\bas well as\b|\bplus\b|\band\b|\balso\b)\s*/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Which trip a clause points at, if it points at one. */
function tripRefIn(clause: string, context: Context, dates: readonly FoundDate[]): TripRef | undefined {
  const ref: TripRef = {};

  for (const booking of context.account.bookings) {
    if (new RegExp(`\\b${booking.code.toLowerCase()}\\b`).test(clause)) ref.code = booking.code;
  }
  if (/\b(next|upcoming|first) (flight|trip|booking)\b/.test(clause)) ref.next = true;

  const place = placesIn(clause).find((found) => found.code !== HOME);
  if (place) ref.place = place.code;

  const [date] = dates;
  if (date && "from" in date.wish) {
    if (date.weekday !== undefined) ref.weekday = date.weekday;
    else if (date.wish.from === date.wish.to) ref.date = date.wish.from;
  }

  return Object.keys(ref).length > 0 ? ref : undefined;
}

function seatIntent(clause: string, trip: TripRef | undefined): Intent {
  const wish = SEAT_WISHES.find(([pattern]) => pattern.test(clause))?.[1];
  const code = SEAT_CODE.exec(clause);
  return {
    journey: "seat",
    ...(trip ? { trip } : {}),
    ...(wish ? { wish } : {}),
    ...(code ? { seat: `${Number(code[1])}${code[2].toUpperCase()}` } : {}),
  };
}

/**
 * The intents in one clause, and the trip it names. Usually one intent; none
 * when the clause asks for nothing by itself, as in "on my London flight".
 */
function intentsIn(clause: string, context: Context): { intents: Intent[]; trip: TripRef | undefined } {
  const dates = findDates(clause, context.today);
  const trip = tripRefIn(clause, context, dates);
  const intents: Intent[] = [];

  if (/\bseats?\b|\bwindow\b|\baisle\b|\bleg ?room\b|\bexit row\b|\bsit(ting)?\b/.test(clause)) intents.push(seatIntent(clause, trip));

  if (intents.length === 0) {
    // "my trips" asks to see them. "on my London flight" only says which one.
    const asksToSee = /\b(show|see|list|what|which|upcoming|view|all|any|have)\b/.test(clause);
    const justThem = /^(my|the) (\w+ )?(trips|flights|bookings|reservations|itinerary)$/.test(clause);
    if (/\b(trips?|flights?|bookings?|reservations?|itinerary)\b/.test(clause) && (asksToSee || justThem)) intents.push({ journey: "trips" });
    else if (/\bwhere am i (going|flying|headed)\b/.test(clause)) intents.push({ journey: "trips" });
  }
  return { intents, trip };
}

/** Read every clause, in order. A clause that only names a trip names it for the request before it. */
function intentsOf(text: string, context: Context): Intent[] {
  let all: Intent[] = [];
  for (const clause of clauses(text)) {
    const { intents, trip } = intentsIn(clause, context);
    if (intents.length > 0) {
      all = mergeIntents(all, intents);
    } else if (trip && all.length > 0) {
      const last = all[all.length - 1];
      if (last.journey !== "trips" && !last.trip) all[all.length - 1] = { ...last, trip };
    }
  }
  return shareTrip(all);
}

/** Join intents for the same journey, later details winning: "a seat" then "window" is one request. */
export function mergeIntents(base: readonly Intent[], incoming: readonly Intent[]): Intent[] {
  const merged = base.map((intent) => ({ ...intent }));
  for (const intent of incoming) {
    const index = merged.findIndex((other) => other.journey === intent.journey);
    if (index === -1) merged.push({ ...intent });
    else merged[index] = { ...merged[index], ...intent } as Intent;
  }
  return merged;
}

/** A trip named in one part of a sentence is the trip for the parts that name none. */
function shareTrip(intents: Intent[]): Intent[] {
  const named = intents.map((intent) => ("trip" in intent ? intent.trip : undefined)).find((trip) => trip !== undefined);
  if (!named) return intents;
  return intents.map((intent) => (intent.journey !== "trips" && !intent.trip ? { ...intent, trip: named } : intent));
}

/** What the words mean as an answer to the component that is waiting, if anything. */
function answerTo(active: NonNullable<Context["active"]>, text: string, context: Context): Understanding | null {
  if (/^(never ?mind|forget (it|that)|stop|cancel (that|this|it)|no thanks?|not now|leave it|nope|no)$/.test(text)) return { kind: "abandon" };

  if (active.widget === "seat-map") {
    const code = /^(?:seat )?(\d{1,2}) ?([a-f])$/.exec(text);
    if (code) {
      const { map, current } = active.props as { map: SeatMap; current: string | null };
      const name = `${Number(code[1])}${code[2].toUpperCase()}`;
      const seat = findSeat(map, name);
      if (!seat) return { kind: "cannot", why: `There is no seat ${name} on this flight.` };
      if (seat.id === current) return { kind: "cannot", why: `${seat.id} is the seat you already have.` };
      if (seat.taken) return { kind: "cannot", why: `Seat ${seat.id} is taken. Pick another.` };
      return { kind: "answer", answer: { seat: seat.id, kinds: seat.kinds, price: seat.price } };
    }
  }

  if (active.widget === "price-summary" && /^(yes|yep|yeah|ok|okay|sure|confirm|pay|go ahead|do it|please do|yes please)$/.test(text)) {
    return { kind: "answer", answer: { confirmed: true } };
  }

  if (active.widget === "trip-chooser") {
    const { bookings } = active.props as { bookings: Booking[] };
    const ref = tripRefIn(text, context, findDates(text, context.today));
    const matches = ref ? matchTrips(ref, bookings) : [];
    if (matches.length === 1) return { kind: "answer", answer: { booking: matches[0] } as Json };
  }

  return null;
}

export function understandByRules(words: string, context: Context): Understanding {
  const text = normalise(words);
  if (text === "") return { kind: "unknown" };

  if (context.active) {
    const answer = answerTo(context.active, text, context);
    if (answer) return answer;
  }

  const intents = intentsOf(text, context);

  if (intents.length === 0) {
    if (/^(hi|hello|hey|good (morning|afternoon|evening)|salam|hiya)\b/.test(text)) return { kind: "chat", about: "hello" };
    if (/^(thanks?|thank you|cheers|great|perfect|nice)\b/.test(text)) return { kind: "chat", about: "thanks" };
    if (/\bhelp\b|\bwhat can you do\b|\bwhat do you do\b|\bhow does this work\b/.test(text)) return { kind: "chat", about: "help" };
    return { kind: "unknown" };
  }

  // While a paid journey is under way, another paid request changes it instead
  // of starting over: "aisle instead", "and add a bag".
  if (
    context.active &&
    context.active.intents.some((intent) => ORDER_JOURNEYS.has(intent.journey)) &&
    intents.every((intent) => ORDER_JOURNEYS.has(intent.journey))
  ) {
    return { kind: "amend", intents };
  }

  return { kind: "request", intents };
}
