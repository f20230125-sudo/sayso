import { upcoming } from "@/airline/account";
import { addDays, daysBetween, longDay, shortDay, weekdayOf, type IsoDate } from "@/airline/dates";
import { DESTINATIONS, HOME, cityOf } from "@/airline/places";
import { FEES, MAX_BAGS } from "@/airline/pricing";
import type { Account, Booking } from "@/airline/schema";
import { checkInOpens, isCheckInOpen, localAt } from "@/airline/status";
import type { DateWish, Expectation, Intent, Json, Plan, Step, TripRef } from "./types";

// The second of the four steps: turn what was understood into a plan.
//
// A plan is a list of steps and nothing more: say a line, call the API, show
// a component. The steps for each journey are written here, by hand, so a
// request can be misunderstood but can never produce a screen nobody
// designed. Where a step needs something only known later, it holds a
// reference to the step that will produce it (see reference.ts).
//
// Journeys that cost money do not pay for themselves. Each adds a change to
// one shared order, and the plan ends with a single price, a single
// confirmation and a single receipt, however many journeys the sentence held.

export type PlanContext = {
  today: IsoDate;
  /** This moment, as an ISO date and time. */
  now: string;
  account: Account;
  /** The booking the conversation last dealt with, if any. */
  focus?: string | null;
};

/** What the order is about: a booking being changed, or a new one being made. */
type Subject = {
  /** A reference to the booking, or null when the order books a new flight. */
  booking: string | null;
  /** The booking itself, when it was settled while planning and not by asking. */
  known: Booking | null;
  /** A reference to the flight that a seat or a bag would be for. A move changes it. */
  flight: string;
  /** The seat held on that flight now: a reference, or null on a flight just chosen. */
  seat: Json;
  /** Checked bags now: a reference, or 0 on a new booking. */
  bags: Json;
};

type Draft = {
  context: PlanContext;
  steps: Step[];
  expectations: Expectation[];
  /** Changes for the shared order. May hold references. */
  changes: Json[];
  subject: Subject | null;
};

type IntentOf<J extends Intent["journey"]> = Extract<Intent, { journey: J }>;

function describeTrip(booking: Booking): string {
  return `${booking.flight.toCity} on ${shortDay(booking.flight.date)}`;
}

const plural = (count: number, one: string, many = `${one}s`) => `${count} ${count === 1 ? one : many}`;

/** The upcoming bookings a reference could mean. An empty reference matches them all. */
export function matchTrips(ref: TripRef | undefined, bookings: readonly Booking[]): Booking[] {
  if (!ref) return [...bookings];
  if (ref.next) return bookings.slice(0, 1);
  return bookings.filter((booking) => {
    const { flight } = booking;
    if (ref.code && booking.code !== ref.code.toUpperCase()) return false;
    if (ref.place && flight.to !== ref.place && flight.from !== ref.place) return false;
    if (ref.flight && flight.number !== ref.flight) return false;
    if (ref.weekday !== undefined && weekdayOf(flight.date) !== ref.weekday) return false;
    if (ref.date && flight.date !== ref.date) return false;
    return true;
  });
}

function isEmptyRef(ref: TripRef | undefined): boolean {
  return !ref || Object.values(ref).every((value) => value === undefined);
}

function say(draft: Draft, id: string, text: string): void {
  draft.steps.push({ id, kind: "say", text });
}

/**
 * Settle which trip the plan is about, adding the step that names it. When the
 * words could mean several trips, the step is a question for the traveller.
 * Returns false when there is no trip to work on.
 *
 * `among` narrows the trips that can be meant, for journeys that only make
 * sense for some of them.
 */
function settleTrip(draft: Draft, ref: TripRef | undefined, among?: Booking[]): boolean {
  const { today, account, focus } = draft.context;
  const bookings = among ?? upcoming(account, today);

  if (draft.subject) {
    // One order, one trip. A second trip in the same sentence has to wait.
    const { known, booking } = draft.subject;
    const other = !isEmptyRef(ref) && known && !matchTrips(ref, bookings).some((entry) => entry.code === known.code);
    if (other || booking === null) {
      say(draft, `later${draft.steps.length}`, "One trip at a time: ask me again for the other one once this is done.");
      return false;
    }
    return true;
  }

  if (bookings.length === 0) {
    say(draft, "notrips", "You have no upcoming trips to change.");
    return false;
  }

  let matches = matchTrips(ref, bookings);
  let lead = "Which trip is this for?";
  if (matches.length === 0) {
    matches = bookings;
    lead = "I could not find a trip like that. Which of these do you mean?";
  } else if (matches.length > 1 && isEmptyRef(ref)) {
    // Nothing said about which trip: carry on with the one already being discussed.
    const inFocus = matches.find((entry) => entry.code === focus);
    if (inFocus) matches = [inFocus];
  }

  const subject = (known: Booking | null): Subject => ({
    booking: "{{trip.booking}}",
    known,
    flight: "{{trip.booking.flight}}",
    seat: "{{trip.booking.seat}}",
    bags: "{{trip.booking.bags}}",
  });

  if (matches.length === 1) {
    const [booking] = matches;
    draft.steps.push({ id: "trip", kind: "set", value: { booking } as Json, label: `Use your trip to ${describeTrip(booking)}` });
    draft.subject = subject(booking);
    return true;
  }

  say(draft, "asktrip", lead);
  draft.steps.push({ id: "trip", kind: "show", widget: "trip-chooser", props: { bookings: matches } as Json, waits: true, label: "Ask which trip" });
  draft.subject = subject(null);
  return true;
}

/** Add the steps that end in a chosen day (`day.date`, `day.label`) for one route. */
function chooseDay(draft: Draft, route: { from: Json; to: Json }, wish: DateWish | undefined, from: IsoDate | null): IsoDate | null {
  const { today } = draft.context;
  let when = wish && "from" in wish ? wish : undefined;
  let lead = "Which day would you like to fly? Each day shows its lowest fare.";

  if (when && when.to < today) {
    when = undefined;
    lead = "That date has passed. Here are the days ahead, each with its lowest fare.";
  } else if (when && when.from < today) {
    when = { from: today, to: when.to };
  }

  if (when && when.from === when.to) {
    draft.steps.push({ id: "day", kind: "set", value: { date: when.from, label: shortDay(when.from) }, label: `Look at ${shortDay(when.from)}` });
    return when.from;
  }

  // No day named: show the days around the flight being moved, or the days ahead.
  const start = when ? when.from : from && addDays(from, -3) > today ? addDays(from, -3) : addDays(today, 1);
  const days = when ? Math.min(daysBetween(when.from, when.to) + 1, 14) : 10;
  if (when) lead = `Here are the days from ${shortDay(when.from)} to ${shortDay(addDays(when.from, days - 1))}, each with its lowest fare.`;

  draft.steps.push({ id: "days", kind: "tool", tool: "calendar", args: { ...route, start, days }, label: "Get the lowest fare for each day" });
  say(draft, "day-lead", lead);
  return null;
}

// --- The journeys -------------------------------------------------------------

function planTrips(draft: Draft): void {
  const bookings = upcoming(draft.context.account, draft.context.today);
  if (bookings.length === 0) {
    say(draft, "trips-none", "You have no upcoming trips.");
    return;
  }
  say(draft, "trips-lead", bookings.length === 1 ? "You have one trip coming up." : `You have ${bookings.length} trips coming up.`);
  draft.steps.push({ id: "trips", kind: "show", widget: "trips", props: { bookings } as Json, waits: false, label: "Show your trips" });
}

function planStatus(draft: Draft, intent: IntentOf<"status">): void {
  // "Is my flight on time?" with no flight named means the next one.
  if (!settleTrip(draft, isEmptyRef(intent.trip) && !draft.subject ? { next: true } : intent.trip)) return;
  draft.steps.push({
    id: "status",
    kind: "tool",
    tool: "status",
    args: { flightId: "{{trip.booking.flight.id}}", at: draft.context.now },
    label: "Get the flight's status",
  });
  say(draft, "status-lead", "{{trip.booking.flight.number}} to {{trip.booking.flight.toCity}} is {{status.headline}}.");
  draft.steps.push({
    id: "status-view",
    kind: "show",
    widget: "status-timeline",
    props: { flight: "{{trip.booking.flight}}", status: "{{status}}" },
    waits: false,
    label: "Show the status",
  });
}

function planChangeFlight(draft: Draft, intent: IntentOf<"change-flight">): void {
  if (!settleTrip(draft, intent.trip)) return;
  const subject = draft.subject as Subject;
  const known = subject.known;

  // "Two days later" needs the date being moved, which is only known for a settled trip.
  let wish = intent.when;
  if (wish && "shiftDays" in wish) {
    const shifted = known ? addDays(known.flight.date, wish.shiftDays) : null;
    wish = shifted ? { from: shifted, to: shifted } : undefined;
  }

  const route = { from: "{{trip.booking.flight.from}}", to: "{{trip.booking.flight.to}}" };
  if (chooseDay(draft, route, wish, known?.flight.date ?? null) === null) {
    draft.steps.push({
      id: "day",
      kind: "show",
      widget: "date-strip",
      props: { days: "{{days.days}}", current: "{{trip.booking.flight.date}}", currentPrice: "{{trip.booking.flight.price}}" },
      waits: true,
      label: "Let you choose a day",
    });
  }

  draft.steps.push({ id: "flights", kind: "tool", tool: "searchFlights", args: { ...route, date: "{{day.date}}" }, label: "Find the flights that day" });
  say(draft, "pick-lead", "Here are the flights to {{trip.booking.flight.toCity}} on {{day.label}}, with what each costs against your current fare.");
  draft.steps.push({
    id: "pick",
    kind: "show",
    widget: "flight-list",
    props: { flights: "{{flights.flights}}", current: "{{trip.booking.flight}}" },
    waits: true,
    label: "Let you choose a flight",
  });

  draft.changes.push({ type: "move", toFlightId: "{{pick.flight.id}}" });
  // From here on, a seat is a seat on the new flight.
  subject.flight = "{{pick.flight}}";
  subject.seat = null;

  if (wish && "from" in wish && wish.to >= draft.context.today) {
    draft.expectations.push({ kind: "date-within", from: wish.from, to: wish.to, flightStep: "pick" });
  }
  draft.expectations.push({ kind: "flight-on-booking", flightStep: "pick" });
}

function planSeat(draft: Draft, intent: IntentOf<"seat">): void {
  if (!draft.subject && !settleTrip(draft, intent.trip)) return;
  if (draft.subject && draft.subject.booking !== null && !settleTrip(draft, intent.trip)) return;
  const subject = draft.subject as Subject;
  const wish = intent.wish ?? null;

  draft.steps.push({ id: "seats", kind: "tool", tool: "seatMap", args: { flightId: `{{${inner(subject.flight)}.id}}` }, label: "Get the seat map" });
  say(
    draft,
    "seat-lead",
    `Here is the cabin on {{${inner(subject.flight)}.number}} to {{${inner(subject.flight)}.toCity}}. ${
      wish ? `Free ${wish === "legroom" ? "extra-legroom" : wish} seats are marked.` : "Pick any free seat."
    }`,
  );
  draft.steps.push({
    id: "seat",
    kind: "show",
    widget: "seat-map",
    props: { map: "{{seats}}", flight: subject.flight, wish, current: subject.seat, preselect: intent.seat ?? null },
    waits: true,
    label: "Let you choose a seat",
  });
  draft.changes.push({ type: "seat", seat: "{{seat.seat}}" });
  if (wish) draft.expectations.push({ kind: "seat-kind", wish, seatStep: "seat" });
  draft.expectations.push({ kind: "seat-on-booking", seatStep: "seat" });
}

/** "{{pick.flight}}" -> "pick.flight", to build a longer reference from it. */
function inner(reference: string): string {
  return reference.slice(2, -2);
}

function planBags(draft: Draft, intent: IntentOf<"bags">): void {
  if (!draft.subject && !settleTrip(draft, intent.trip)) return;
  if (draft.subject && draft.subject.booking !== null && !settleTrip(draft, intent.trip)) return;
  const subject = draft.subject as Subject;
  const has = subject.booking === null ? 0 : (subject.known?.bags ?? null);

  if (has !== null && has >= MAX_BAGS) {
    say(draft, "bags-full", `You already have ${MAX_BAGS} checked bags, which is the most one booking can hold.`);
    return;
  }

  if (intent.add !== undefined && has !== null) {
    // The words said how many and the booking is known: nothing to ask.
    const added = Math.min(intent.add, MAX_BAGS - has);
    draft.steps.push({ id: "bags", kind: "set", value: { count: has + added, added }, label: `Add ${plural(added, "checked bag")}` });
    if (added < intent.add) say(draft, "bags-capped", `A booking can hold ${MAX_BAGS} checked bags, so I have added ${added}, not ${intent.add}.`);
  } else {
    say(draft, "bags-lead", `How many checked bags would you like to add? Each one is AED ${FEES.bag}.`);
    draft.steps.push({
      id: "bags",
      kind: "show",
      widget: "bag-stepper",
      props: { current: subject.bags, add: intent.add ?? 1, max: MAX_BAGS, price: FEES.bag },
      waits: true,
      label: "Ask how many bags",
    });
  }
  draft.changes.push({ type: "bags", count: "{{bags.count}}" });
  draft.expectations.push({ kind: "bags-on-booking", bagsStep: "bags" });
}

/** Why a flight cannot be checked in for right now, in words. */
function checkInClosed(booking: Booking, at: Date): string {
  const opens = checkInOpens(booking.flight);
  const local = localAt(opens, booking.flight.from);
  const when = at < opens ? `opens on ${longDay(local.date)} at ${local.time}, 48 hours before it leaves` : "has closed";
  return `Check-in for your flight to ${describeTrip(booking)} ${when}.`;
}

function planCheckIn(draft: Draft, intent: IntentOf<"check-in">): void {
  const { today, account, now } = draft.context;
  const at = new Date(now);
  const bookings = upcoming(account, today);
  const inWindow = bookings.filter((booking) => isCheckInOpen(booking.flight, at));
  const open = inWindow.filter((booking) => !booking.checkedIn);

  if (!draft.subject) {
    // The flight meant, when the words or the calendar leave only one it can
    // be: the trip that was named, or the one flight check-in is open for.
    const named = isEmptyRef(intent.trip) ? null : matchTrips(intent.trip, bookings);
    const meant = named ? (named.length === 1 ? named[0] : undefined) : inWindow.length === 1 ? inWindow[0] : undefined;

    if (meant?.checkedIn) {
      say(draft, "checkin-done", `You are already checked in for your flight to ${describeTrip(meant)}. Here is your boarding pass.`);
      draft.steps.push({ id: "trip", kind: "set", value: { booking: meant } as Json, label: `Use your trip to ${describeTrip(meant)}` });
      draft.steps.push({ id: "pass-status", kind: "tool", tool: "status", args: { flightId: meant.flight.id, at: now }, label: "Get the gate and boarding time" });
      draft.steps.push({
        id: "pass",
        kind: "show",
        widget: "boarding-pass",
        props: { booking: "{{trip.booking}}", status: "{{pass-status}}" },
        waits: false,
        label: "Show the boarding pass",
      });
      return;
    }

    // Check-in only makes sense for a flight it is open for. Say why when
    // the flight meant is not one of those, or when none is.
    const closed = meant && !open.includes(meant) ? meant : open.length === 0 ? bookings[0] : undefined;
    if (closed) {
      say(draft, "checkin-closed", checkInClosed(closed, at));
      return;
    }
    if (!settleTrip(draft, intent.trip, open)) return;
  } else {
    if (!settleTrip(draft, intent.trip)) return;
    const { known } = draft.subject;
    if (known && !open.some((booking) => booking.code === known.code)) {
      say(draft, "checkin-closed", known.checkedIn ? `You are already checked in for your flight to ${describeTrip(known)}.` : checkInClosed(known, at));
      return;
    }
  }

  const subject = draft.subject as Subject;
  const choosingSeat = draft.changes.some((change) => (change as { type: string }).type === "seat");
  if (subject.known && !subject.known.seat && !choosingSeat) {
    say(draft, "checkin-seat", "You need a seat before you can check in, so let us pick one first.");
    planSeat(draft, { journey: "seat" });
  }

  say(draft, "passenger-lead", "Check these details, then you are ready to go.");
  draft.steps.push({ id: "passenger", kind: "show", widget: "passenger-check", props: { booking: "{{trip.booking}}" }, waits: true, label: "Ask you to confirm your details" });
  draft.changes.push({ type: "check-in" });
  draft.expectations.push({ kind: "checked-in" });
}

function planCancel(draft: Draft, intent: IntentOf<"cancel">): void {
  if (!settleTrip(draft, intent.trip)) return;
  draft.changes = [{ type: "cancel" }];
  draft.expectations = [{ kind: "cancelled" }];
}

function planBook(draft: Draft, intent: IntentOf<"book">): void {
  const { today, account } = draft.context;
  // Every flight touches Dubai. With one end named, the other end is Dubai.
  const from = intent.from && intent.from !== HOME && (!intent.to || intent.to === HOME) ? intent.from : HOME;
  const to = from === HOME ? (intent.to && intent.to !== HOME ? intent.to : null) : HOME;

  if (to === null) {
    say(draft, "where-lead", "Where would you like to fly, and when?");
    draft.steps.push({
      id: "where",
      kind: "show",
      widget: "flight-search",
      props: {
        destinations: DESTINATIONS.map((place) => ({ code: place.code, city: place.city })),
        earliest: today,
        suggested: intent.when && "from" in intent.when && intent.when.from >= today ? intent.when.from : addDays(today, 7),
      },
      waits: true,
      label: "Ask where and when",
    });
    draft.steps.push({ id: "day", kind: "set", value: { date: "{{where.date}}", label: "{{where.label}}" }, label: "Use the day you chose" });
  } else {
    draft.steps.push({ id: "where", kind: "set", value: { from, to, fromCity: cityOf(from), toCity: cityOf(to) }, label: `Fly from ${cityOf(from)} to ${cityOf(to)}` });
    if (chooseDay(draft, { from, to }, intent.when, null) === null) {
      draft.steps.push({
        id: "day",
        kind: "show",
        widget: "date-strip",
        props: { days: "{{days.days}}", current: null, currentPrice: null },
        waits: true,
        label: "Let you choose a day",
      });
    }
  }

  draft.steps.push({
    id: "flights",
    kind: "tool",
    tool: "searchFlights",
    args: { from: to === null ? HOME : from, to: to === null ? "{{where.to}}" : to, date: "{{day.date}}" },
    label: "Find the flights that day",
  });
  say(draft, "pick-lead", "Here are the flights to {{where.toCity}} on {{day.label}}.");
  draft.steps.push({ id: "pick", kind: "show", widget: "flight-list", props: { flights: "{{flights.flights}}", current: null }, waits: true, label: "Let you choose a flight" });

  draft.changes.push({ type: "book", flightId: "{{pick.flight.id}}", passenger: account.traveller.name });
  draft.subject = { booking: null, known: null, flight: "{{pick.flight}}", seat: null, bags: 0 };

  if (to !== null) draft.expectations.push({ kind: "goes-to", place: to, flightStep: "pick" });
  if (intent.when && "from" in intent.when && intent.when.to >= today) {
    draft.expectations.push({ kind: "date-within", from: intent.when.from, to: intent.when.to, flightStep: "pick" });
  }
  draft.expectations.push({ kind: "flight-on-booking", flightStep: "pick" });
}

/** The end every order shares: one price, one confirmation, one receipt. */
function planOrder(draft: Draft): void {
  const subject = draft.subject as Subject;
  const types = draft.changes.map((change) => (change as { type: string }).type);
  const order = { booking: subject.booking, changes: draft.changes };
  // Checking in costs nothing, so there is no price to agree to.
  const free = types.every((type) => type === "check-in");
  const cancelling = types.includes("cancel");

  if (types.includes("move") && !types.includes("seat")) {
    say(draft, "seat-note", "Seats belong to a flight, so yours does not move with you. You can choose a new one once this is done.");
  }

  if (!free) {
    draft.steps.push({ id: "quote", kind: "tool", tool: "quote", args: order, label: cancelling ? "Work out the refund" : "Price the changes" });
    say(draft, "pay-lead", cancelling ? "Here is what you would get back." : "Here is what that comes to.");
    const card = draft.context.account.traveller.card as Json;
    draft.steps.push(
      cancelling
        ? { id: "pay", kind: "show", widget: "refund", props: { quote: "{{quote}}", card, booking: "{{trip.booking}}" }, waits: true, label: "Ask you to confirm the cancellation" }
        : { id: "pay", kind: "show", widget: "price-summary", props: { quote: "{{quote}}", card }, waits: true, label: "Ask you to confirm the price" },
    );
  }

  draft.steps.push({
    id: "order",
    kind: "tool",
    tool: "order",
    args: { ...order, expectedTotal: free ? 0 : "{{quote.total}}" },
    label: cancelling ? "Cancel the booking" : types.includes("book") ? "Make the booking" : free ? "Check you in" : "Make the changes",
  });

  if (!free) {
    say(draft, "done-lead", cancelling ? "Your booking is cancelled." : types.includes("book") ? "You are booked." : "Done. Your booking is updated.");
    draft.steps.push({
      id: "receipt",
      kind: "show",
      widget: "receipt",
      props: { receipt: "{{order.receipt}}", booking: "{{order.booking}}" },
      waits: false,
      label: "Show the receipt",
    });
    draft.expectations.push({ kind: "charged-as-quoted" });
  }

  if (types.includes("check-in")) {
    draft.steps.push({
      id: "pass-status",
      kind: "tool",
      tool: "status",
      args: { flightId: "{{order.booking.flight.id}}", at: draft.context.now },
      label: "Get the gate and boarding time",
    });
    say(draft, "pass-lead", "You are checked in. Here is your boarding pass.");
    draft.steps.push({
      id: "pass",
      kind: "show",
      widget: "boarding-pass",
      props: { booking: "{{order.booking}}", status: "{{pass-status}}" },
      waits: false,
      label: "Show the boarding pass",
    });
  }
}

// Journeys are planned in this order whatever order they were said in: a new
// flight is chosen before the seat on it, and checking in comes last.
const ORDER: Record<Intent["journey"], number> = { trips: 0, status: 0, book: 1, "change-flight": 2, seat: 3, bags: 4, "check-in": 5, cancel: 6 };

export function planFor(asked: readonly Intent[], context: PlanContext): Plan {
  const draft: Draft = { context, steps: [], expectations: [], changes: [], subject: null };
  let intents = [...asked].sort((a, b) => ORDER[a.journey] - ORDER[b.journey]);

  // Some journeys cannot share an order. Say what was left out instead of failing later.
  const has = (journey: Intent["journey"]) => intents.some((intent) => intent.journey === journey);
  let left: string | null = null;
  if (has("cancel") && intents.some((intent) => ORDER[intent.journey] > 0 && intent.journey !== "cancel")) {
    intents = intents.filter((intent) => ORDER[intent.journey] === 0 || intent.journey === "cancel");
    left = "I have left the other changes out: there is no use changing a booking you are cancelling.";
  } else if (has("book") && intents.some((intent) => ["change-flight", "check-in", "status"].includes(intent.journey))) {
    intents = intents.filter((intent) => !["change-flight", "check-in", "status"].includes(intent.journey));
    left = "I will do the new booking first. Ask me again for the rest once it is done.";
  }

  for (const intent of intents) {
    switch (intent.journey) {
      case "trips":
        planTrips(draft);
        break;
      case "status":
        planStatus(draft, intent);
        break;
      case "book":
        planBook(draft, intent);
        break;
      case "change-flight":
        planChangeFlight(draft, intent);
        break;
      case "seat":
        planSeat(draft, intent);
        break;
      case "bags":
        planBags(draft, intent);
        break;
      case "check-in":
        planCheckIn(draft, intent);
        break;
      case "cancel":
        planCancel(draft, intent);
        break;
    }
  }

  if (left && draft.steps.length > 0) say(draft, "left-out", left);
  if (draft.changes.length > 0 && draft.subject) planOrder(draft);
  return { steps: draft.steps, expectations: draft.expectations };
}
