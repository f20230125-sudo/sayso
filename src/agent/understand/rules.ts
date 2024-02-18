import { shortDay, weekdayOf } from "@/airline/dates";
import { HOME, cityOf, placesIn } from "@/airline/places";
import type { Booking, Flight, SeatKind, SeatMap } from "@/airline/schema";
import { findSeat } from "@/airline/seats";
import { matchTrips } from "../plan";
import { FACTS, type FactName } from "../talk";
import type { Context, DateWish, Intent, Json, TripRef, Understanding } from "../types";
import { findDates, numberFrom, type FoundDate } from "./dates";

// The first of the four steps, done with rules and no model.
//
// The rules know the journeys the desk offers and the ways people ask for
// them. They cost nothing and answer at once, so every visitor gets a working
// desk without a key. What they cannot read is handed to a model when the
// visitor has given one (see model.ts), and is otherwise answered honestly:
// "I did not understand that."

type Journey = Intent["journey"];

/** Journeys that can be folded into an order already under way: "and add a bag". */
const AMENDABLE: ReadonlySet<Journey> = new Set<Journey>(["seat", "bags", "change-flight", "check-in"]);
/** Journeys that end in an order. */
const ORDERS: ReadonlySet<Journey> = new Set<Journey>([...AMENDABLE, "book"]);

const SEAT_WISHES: [RegExp, SeatKind][] = [
  [/\b(extra |more )?leg ?room\b|\bexit row\b|\bmore (space|room)\b/, "legroom"],
  [/\bwindow\b/, "window"],
  [/\baisle\b/, "aisle"],
  [/\b(at|near|in|up) the front\b|\bfront (row|seat)\b|\bup front\b/, "front"],
  [/\bmiddle\b/, "middle"],
];

// No space allowed inside: "15 a window seat" must not read as seat 15A.
const SEAT_CODE = /\b(\d{1,2})([a-f])\b/;

const SEAT = /\bseats?\b|\bwindow\b|\baisle\b|\bleg ?room\b|\bexit row\b|\bsit(ting)?\b/;
const BAGS = /\bbags?\b|\bbaggage\b|\bluggage\b|\bsuitcases?\b/;
const CHECK_IN = /\bcheck(ed|ing)?( me| us)?[ -]?in\b|\bboarding pass\b/;
const CANCEL = /\bcancel\b|\brefund\b/;
const STATUS = /\bstatus\b|\bon time\b|\bdelay(ed|s)?\b|\bgate\b|\bboarding time\b|\bwhen (does|do|is|will) .*\b(leave|depart|board|take off|land|arrive)\b|\bwhat time\b/;
const CHANGE = /\b(move|change|reschedule|rebook|push|shift|switch|postpone)\b|\bbring .*forward\b|\b(earlier|later|different|another) flight\b/;
// Asking for a new flight. "A flight to London" asks for one; "my London
// flight", anywhere in the clause, names one that is already booked.
const BOOK_NEW = /\bnew (flight|ticket|booking|trip)\b/;
const BOOK = /\bbook\b|\bbuy\b|\bneed (a|to) (flight|fly)\b|\b(fly|travel|go|get) (me )?to\b|\b(flights?|tickets?) to\b/;
const OWNED = /\b(my|our)\b.*\b(flights?|trips?|bookings?|tickets?)\b|\b(the|that) (flight|trip|booking)\b/;
const A_FLIGHT = /\b(flights?|tickets?|fly|flying|trip)\b/;

/** Whether a clause asks to book a flight, as opposed to doing something with one already booked. */
function asksToBook(clause: string): boolean {
  if (BOOK_NEW.test(clause)) return true;
  return BOOK.test(clause) && !OWNED.test(clause) && !CHANGE.test(clause);
}
const TRIPS = /\b(trips?|flights?|bookings?|reservations?|itinerary)\b/;

const YES = /^(yes|yep|yeah|ok|okay|sure|confirm|pay|go ahead|do it|please do|yes please|check me in)$/;
const NO = /^(never ?mind|forget (it|that)|stop|cancel( (that|this|it))?|no thanks?|not now|leave it|nope|no|skip( it)?)$/;

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

/** Which trip a clause points at, if it points at one. `dates` are the dates that name the trip. */
function tripRefIn(clause: string, context: Context, dates: readonly FoundDate[], usePlaces = true): TripRef | undefined {
  const ref: TripRef = {};

  for (const booking of context.account.bookings) {
    if (new RegExp(`\\b${booking.code.toLowerCase()}\\b`).test(clause)) ref.code = booking.code;
  }
  if (/\b(next|upcoming|first) (flight|trip|booking)\b/.test(clause)) ref.next = true;

  const number = /\bjn ?(\d{3})\b/.exec(clause);
  if (number) ref.flight = `JN ${number[1]}`;

  const place = usePlaces ? placesIn(clause).find((found) => found.code !== HOME) : undefined;
  if (place) ref.place = place.code;

  const [date] = dates;
  if (date && "from" in date.wish) {
    if (date.weekday !== undefined) ref.weekday = date.weekday;
    else if (date.wish.from === date.wish.to) ref.date = date.wish.from;
  }

  return Object.keys(ref).length > 0 ? ref : undefined;
}

/**
 * In a request to move a flight, some dates say which flight ("my Thursday
 * flight") and one says where to move it ("to next week"). Tell them apart by
 * the words around each.
 */
function splitDates(clause: string, dates: readonly FoundDate[]): { names: FoundDate[]; target: DateWish | undefined } {
  const roles = dates.map((date) => {
    if ("shiftDays" in date.wish) return "target";
    const before = clause.slice(0, date.index);
    const after = clause.slice(date.index + date.length);
    if (/\b(to|for|until|till|onto|into)\s+(the\s+)?$/.test(before)) return "target";
    if (/^('s)?\s+(flight|trip|booking|one)\b/.test(after) || /\b(my|the)\s+$/.test(before)) return "name";
    return "unsure";
  });

  const names = dates.filter((_date, index) => roles[index] === "name");
  const unsure = dates.filter((_date, index) => roles[index] === "unsure");
  // With nothing marking it, the last date said is where the flight is to go.
  const marked = roles.indexOf("target");
  const target = marked === -1 ? unsure.pop() : dates[marked];
  return { names: [...names, ...unsure], target: target?.wish };
}

function seatDetails(clause: string): { wish?: SeatKind; seat?: string } {
  const wish = SEAT_WISHES.find(([pattern]) => pattern.test(clause))?.[1];
  const code = SEAT_CODE.exec(clause);
  return { ...(wish ? { wish } : {}), ...(code ? { seat: `${Number(code[1])}${code[2].toUpperCase()}` } : {}) };
}

/** How many bags a clause asks to add, when it says. */
function bagCount(clause: string): number | undefined {
  const match = /\b(\d+|a|an|one|two|three|four|five|another|couple of)\s+(?:(?:more|extra|additional|checked|hold)\s+)*(?:bags?|suitcases?|pieces?)\b/.exec(clause);
  if (!match) return undefined;
  return match[1] === "another" ? 1 : (numberFrom(match[1].replace(" of", "")) ?? undefined);
}

/**
 * The intents in one clause, and the trip it names. Usually one intent; none
 * when the clause asks for nothing by itself, as in "on my London flight".
 */
function intentsIn(clause: string, context: Context): { intents: Intent[]; trip: TripRef | undefined; dates: FoundDate[] } {
  const dates = findDates(clause, context.today);
  const has = (pattern: RegExp) => pattern.test(clause);
  const places = placesIn(clause);
  const intents: Intent[] = [];

  const seat = has(SEAT);
  const bags = has(BAGS);
  // "Book a window seat" asks for a seat. "Book a flight", or naming a place, asks for a flight.
  const book = asksToBook(clause) && (has(A_FLIGHT) || places.length > 0 || (!seat && !bags));
  const change = has(CHANGE) && !seat && !bags && !book;

  // In a request to book, a place and a date say where and when to fly. In
  // a request to move a flight, some dates name the flight and one is the
  // target. Everywhere else, both name the trip.
  const moved = change ? splitDates(clause, dates) : null;
  const trip = book ? undefined : tripRefIn(clause, context, moved ? moved.names : dates);
  const withTrip = trip ? { trip } : {};

  if (book) {
    const from = places.find((place) => /\bfrom\s+$/.test(clause.slice(0, place.index)));
    const to = places.find((place) => place !== from);
    const when = dates.find((date) => "from" in date.wish)?.wish;
    intents.push({ journey: "book", ...(from ? { from: from.code } : {}), ...(to ? { to: to.code } : {}), ...(when ? { when } : {}) });
  }
  if (change) intents.push({ journey: "change-flight", ...withTrip, ...(moved?.target ? { when: moved.target } : {}) });
  if (seat) intents.push({ journey: "seat", ...withTrip, ...seatDetails(clause) });
  if (bags) {
    const add = bagCount(clause);
    intents.push({ journey: "bags", ...withTrip, ...(add ? { add } : {}) });
  }
  if (has(CHECK_IN)) intents.push({ journey: "check-in", ...withTrip });
  if (has(CANCEL) && !book) intents.push({ journey: "cancel", ...withTrip });
  if (has(STATUS) && intents.length === 0) intents.push({ journey: "status", ...withTrip });

  if (intents.length === 0) {
    // "my trips" asks to see them. "on my London flight" only says which one.
    const asksToSee = /\b(show|see|list|what|which|when|upcoming|view|all|any|have)\b/.test(clause);
    const justThem = /^(my|the) (\w+ )?(trips|flights|bookings|reservations|itinerary)$/.test(clause);
    if (has(TRIPS) && (asksToSee || justThem)) intents.push({ journey: "trips" });
    else if (/\bwhere am i (going|flying|headed)\b/.test(clause)) intents.push({ journey: "trips" });
  }
  return { intents, trip, dates };
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
  return intents.map((intent) => (intent.journey !== "trips" && intent.journey !== "book" && !intent.trip ? { ...intent, trip: named } : intent));
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
      if (last.journey !== "trips" && last.journey !== "book" && !last.trip) all[all.length - 1] = { ...last, trip };
    }
  }
  return shareTrip(all);
}

/** One of the flights on screen, picked out by its number, its time or its place in the list. */
function flightNamed(text: string, flights: readonly Flight[], current: Flight | null): Flight | null {
  const offered = flights.filter((flight) => flight.id !== current?.id);
  if (offered.length === 0) return null;

  const number = /\bjn ?(\d{3})\b/.exec(text);
  if (number) return offered.find((flight) => flight.number === `JN ${number[1]}`) ?? null;

  const time = /\b(\d{1,2})[:.](\d{2})\b/.exec(text);
  if (time) return offered.find((flight) => flight.departs === `${time[1].padStart(2, "0")}:${time[2]}`) ?? null;

  if (/\b(cheapest|lowest|least)\b/.test(text)) return [...offered].sort((a, b) => a.price - b.price)[0];
  if (/\b(first|earliest|morning)\b/.test(text)) return offered[0];
  if (/\b(last|latest|evening)\b/.test(text)) return offered[offered.length - 1];
  if (/\bsecond\b/.test(text)) return offered[1] ?? null;
  if (/\bthird\b/.test(text)) return offered[2] ?? null;
  return null;
}

/** What the words mean as an answer to the component that is waiting, if anything. */
function answerTo(active: NonNullable<Context["active"]>, text: string, context: Context): Understanding | null {
  if (NO.test(text)) return { kind: "abandon" };
  const answer = (value: unknown): Understanding => ({ kind: "answer", answer: value as Json });
  const dates = findDates(text, context.today);

  switch (active.widget) {
    case "seat-map": {
      const { map, current, wish } = active.props as { map: SeatMap; current: string | null; wish: SeatKind | null };
      const code = /^(?:seat )?(\d{1,2}) ?([a-f])$/.exec(text);
      if (code) {
        const name = `${Number(code[1])}${code[2].toUpperCase()}`;
        const seat = findSeat(map, name);
        if (!seat) return { kind: "cannot", why: `There is no seat ${name} on this flight.` };
        if (seat.id === current) return { kind: "cannot", why: `${seat.id} is the seat you already have.` };
        if (seat.taken) return { kind: "cannot", why: `Seat ${seat.id} is taken. Pick another.` };
        return answer({ seat: seat.id, kinds: seat.kinds, price: seat.price });
      }
      if (/^(any|anything|you (choose|pick|decide)|whichever|surprise me|any of them|the first one)$/.test(text)) {
        // The cheapest free seat of the kind asked for: nobody means "the dearest" by "any".
        const free = map.rows
          .flatMap((row) => row.seats)
          .filter((seat) => !seat.taken && seat.id !== current)
          .sort((a, b) => a.price - b.price);
        const seat = free.find((entry) => wish !== null && entry.kinds.includes(wish)) ?? free[0];
        if (seat) return answer({ seat: seat.id, kinds: seat.kinds, price: seat.price });
      }
      return null;
    }
    case "trip-chooser": {
      const { bookings } = active.props as { bookings: Booking[] };
      const ref = tripRefIn(text, context, dates);
      const matches = ref ? matchTrips(ref, bookings) : [];
      return matches.length === 1 ? answer({ booking: matches[0] }) : null;
    }
    case "date-strip": {
      const { days } = active.props as { days: { date: string }[] };
      const [named] = dates;
      if (dates.length !== 1 || !("from" in named.wish) || named.wish.from !== named.wish.to) return null;
      // "Wednesday" means the Wednesday on screen, even when another comes sooner.
      const sameWeekday = named.weekday === undefined ? [] : days.filter((entry) => weekdayOf(entry.date) === named.weekday);
      const wanted = named.wish.from;
      const day = sameWeekday.length === 1 ? sameWeekday[0] : days.find((entry) => entry.date === wanted);
      // A day that is not on screen is a change of plan, not an answer.
      return day ? answer({ date: day.date, label: shortDay(day.date) }) : null;
    }
    case "flight-list": {
      const { flights, current } = active.props as { flights: Flight[]; current: Flight | null };
      const flight = flightNamed(text, flights, current);
      return flight ? answer({ flight }) : null;
    }
    case "bag-stepper": {
      const { current, max } = active.props as { current: number; max: number };
      const count = /^(\d|a|an|one|two|three|four|five)( more| extra| bags?)*$/.exec(text);
      const added = count ? numberFrom(count[1]) : null;
      if (added === null || added < 1) return null;
      if (current + added > max) return { kind: "cannot", why: `A booking can hold ${max} checked bags, and you have ${current}.` };
      return answer({ count: current + added, added });
    }
    case "flight-search": {
      const place = placesIn(text).find((found) => found.code !== HOME);
      const [named] = dates;
      if (!place || dates.length !== 1 || !("from" in named.wish) || named.wish.from !== named.wish.to) return null;
      return answer({ to: place.code, toCity: cityOf(place.code), date: named.wish.from, label: shortDay(named.wish.from) });
    }
    case "price-summary":
    case "refund":
    case "passenger-check":
      return YES.test(text) ? answer({ confirmed: true }) : null;
    default:
      return null;
  }
}

/**
 * Words that ask for nothing new but change a detail of the journey under
 * way: "make it Friday", "Paris instead".
 */
function detailFor(active: NonNullable<Context["active"]>, text: string, context: Context): Intent[] {
  const journeys = new Set(active.intents.map((intent) => intent.journey));
  const when = findDates(text, context.today)[0]?.wish;
  const place = placesIn(text).find((found) => found.code !== HOME);

  if (journeys.has("book")) {
    if (!place && !(when && "from" in when)) return [];
    return [{ journey: "book", ...(place ? { to: place.code } : {}), ...(when && "from" in when ? { when } : {}) }];
  }
  if (journeys.has("change-flight") && when) return [{ journey: "change-flight", when }];
  return [];
}

// "How much is a bag?" asks what something costs. It does not ask for one.
const ASKS_ABOUT = /^(how much|how many|what does|what do|what is the (price|cost|fee|charge)|what's the (price|cost|fee|charge)|what are the|does it cost|is there a (fee|charge))\b/;

/** The fact that answers a question about cost or rules, when the rules have one. */
function factFor(text: string): FactName | null {
  if (BAGS.test(text) || /\b(carry[- ]on|cabin bag|kg|weigh)/.test(text)) return "bags";
  if (SEAT.test(text)) return "seats";
  if (CANCEL.test(text)) return "cancel";
  if (CHANGE.test(text)) return "change";
  if (CHECK_IN.test(text)) return "checkIn";
  if (/\b(bag drop|boarding|gate)\b/.test(text)) return "airport";
  return null;
}

export function understandByRules(words: string, context: Context): Understanding {
  const text = normalise(words);
  if (text === "") return { kind: "unknown" };

  if (context.active) {
    const answer = answerTo(context.active, text, context);
    if (answer) return answer;
  }

  if (ASKS_ABOUT.test(text)) {
    // A question the rules have no fact for is left for a model, if there is one.
    const fact = factFor(text);
    return fact ? { kind: "say", text: FACTS[fact] } : { kind: "unknown" };
  }

  let intents = intentsOf(text, context);
  if (intents.length === 0 && context.active) intents = detailFor(context.active, text, context);

  if (intents.length === 0) {
    if (/^(hi|hello|hey|good (morning|afternoon|evening)|salam|hiya)\b/.test(text)) return { kind: "chat", about: "hello" };
    if (/^(thanks?|thank you|cheers|great|perfect|nice)\b/.test(text)) return { kind: "chat", about: "thanks" };
    if (/\bhelp\b|\bwhat can you do\b|\bwhat do you do\b|\bhow does this work\b/.test(text)) return { kind: "chat", about: "help" };
    return { kind: "unknown" };
  }

  // While an order is under way, another request of the same kind changes it
  // instead of starting over: "aisle instead", "and add a bag", "make it Friday".
  if (context.active) {
    const under = new Set(context.active.intents.map((intent) => intent.journey));
    const fits = (intent: Intent) => AMENDABLE.has(intent.journey) || (intent.journey === "book" && under.has("book") && !asksToBook(text));
    if ([...under].some((journey) => ORDERS.has(journey)) && intents.every(fits)) return { kind: "amend", intents };
  }

  return { kind: "request", intents };
}
