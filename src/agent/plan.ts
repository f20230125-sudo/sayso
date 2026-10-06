import { upcoming } from "@/airline/account";
import { shortDay, weekdayOf, type IsoDate } from "@/airline/dates";
import type { Account, Booking } from "@/airline/schema";
import type { Expectation, Intent, Json, Plan, Step, TripRef } from "./types";

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
  account: Account;
  /** The booking the conversation last dealt with, if any. */
  focus?: string | null;
};

type Draft = {
  context: PlanContext;
  steps: Step[];
  expectations: Expectation[];
  /** Changes for the shared order. May hold references. */
  changes: Json[];
  /** The trip this plan is about, once it is settled. */
  trip: { known: Booking | null } | null;
};

function describeTrip(booking: Booking): string {
  return `${booking.flight.toCity} on ${shortDay(booking.flight.date)}`;
}

/** The upcoming bookings a reference could mean. An empty reference matches them all. */
export function matchTrips(ref: TripRef | undefined, bookings: readonly Booking[]): Booking[] {
  if (!ref) return [...bookings];
  if (ref.next) return bookings.slice(0, 1);
  return bookings.filter((booking) => {
    const { flight } = booking;
    if (ref.code && booking.code !== ref.code.toUpperCase()) return false;
    if (ref.place && flight.to !== ref.place && flight.from !== ref.place) return false;
    if (ref.weekday !== undefined && weekdayOf(flight.date) !== ref.weekday) return false;
    if (ref.date && flight.date !== ref.date) return false;
    return true;
  });
}

function isEmptyRef(ref: TripRef | undefined): boolean {
  return !ref || Object.values(ref).every((value) => value === undefined);
}

/**
 * Settle which trip the plan is about, adding the step that names it. When the
 * words could mean several trips, the step is a question for the traveller.
 * Returns false when there is no trip to work on.
 */
function settleTrip(draft: Draft, ref: TripRef | undefined): boolean {
  const { today, account, focus } = draft.context;
  const bookings = upcoming(account, today);

  if (draft.trip) {
    // One order, one trip. A second trip in the same sentence has to wait.
    const known = draft.trip.known;
    if (!isEmptyRef(ref) && known && !matchTrips(ref, bookings).some((booking) => booking.code === known.code)) {
      draft.steps.push({ id: `later${draft.steps.length}`, kind: "say", text: "One trip at a time: ask me again for the other one once this is done." });
      return false;
    }
    return true;
  }

  if (bookings.length === 0) {
    draft.steps.push({ id: "notrips", kind: "say", text: "You have no upcoming trips to change." });
    return false;
  }

  let matches = matchTrips(ref, bookings);
  let lead = "Which trip is this for?";
  if (matches.length === 0) {
    matches = bookings;
    lead = "I could not find a trip like that. Which of these do you mean?";
  } else if (matches.length > 1 && isEmptyRef(ref)) {
    // Nothing said about which trip: carry on with the one already being discussed.
    const inFocus = matches.find((booking) => booking.code === focus);
    if (inFocus) matches = [inFocus];
  }

  if (matches.length === 1) {
    const [booking] = matches;
    draft.steps.push({ id: "trip", kind: "set", value: { booking } as Json, label: `Use your trip to ${describeTrip(booking)}` });
    draft.trip = { known: booking };
    return true;
  }

  draft.steps.push({ id: "asktrip", kind: "say", text: lead });
  draft.steps.push({ id: "trip", kind: "show", widget: "trip-chooser", props: { bookings: matches } as Json, waits: true, label: "Ask which trip" });
  draft.trip = { known: null };
  return true;
}

// --- The journeys -------------------------------------------------------------

function planTrips(draft: Draft): void {
  const bookings = upcoming(draft.context.account, draft.context.today);
  if (bookings.length === 0) {
    draft.steps.push({ id: "trips-none", kind: "say", text: "You have no upcoming trips." });
    return;
  }
  draft.steps.push({
    id: "trips-lead",
    kind: "say",
    text: bookings.length === 1 ? "You have one trip coming up." : `You have ${bookings.length} trips coming up.`,
  });
  draft.steps.push({ id: "trips", kind: "show", widget: "trips", props: { bookings } as Json, waits: false, label: "Show your trips" });
}

function planSeat(draft: Draft, intent: Extract<Intent, { journey: "seat" }>): void {
  if (!settleTrip(draft, intent.trip)) return;
  const wish = intent.wish ?? null;

  draft.steps.push({ id: "seats", kind: "tool", tool: "seatMap", args: { flightId: "{{trip.booking.flight.id}}" }, label: "Get the seat map" });
  draft.steps.push({
    id: "seat-lead",
    kind: "say",
    text: `Here is the cabin on {{trip.booking.flight.number}} to {{trip.booking.flight.toCity}}. ${
      wish ? `Free ${wish === "legroom" ? "extra-legroom" : wish} seats are marked.` : "Pick any free seat."
    }`,
  });
  draft.steps.push({
    id: "seat",
    kind: "show",
    widget: "seat-map",
    props: {
      map: "{{seats}}",
      flight: "{{trip.booking.flight}}",
      wish,
      current: "{{trip.booking.seat}}",
      preselect: intent.seat ?? null,
    },
    waits: true,
    label: "Let you choose a seat",
  });
  draft.changes.push({ type: "seat", seat: "{{seat.seat}}" });
  if (wish) draft.expectations.push({ kind: "seat-kind", wish, seatStep: "seat" });
  draft.expectations.push({ kind: "seat-on-booking", seatStep: "seat" });
}

/** The end every paid journey shares: one price, one confirmation, one receipt. */
function planOrder(draft: Draft): void {
  const order = { booking: "{{trip.booking}}", changes: draft.changes };
  draft.steps.push({ id: "quote", kind: "tool", tool: "quote", args: order, label: "Price the changes" });
  draft.steps.push({ id: "pay-lead", kind: "say", text: "Here is what that comes to." });
  draft.steps.push({
    id: "pay",
    kind: "show",
    widget: "price-summary",
    props: { quote: "{{quote}}", card: draft.context.account.traveller.card as Json },
    waits: true,
    label: "Ask you to confirm the price",
  });
  draft.steps.push({ id: "order", kind: "tool", tool: "order", args: { ...order, expectedTotal: "{{quote.total}}" }, label: "Make the changes" });
  draft.steps.push({ id: "done-lead", kind: "say", text: "Done. Your booking is updated." });
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

export function planFor(intents: readonly Intent[], context: PlanContext): Plan {
  const draft: Draft = { context, steps: [], expectations: [], changes: [], trip: null };

  for (const intent of intents) {
    switch (intent.journey) {
      case "trips":
        planTrips(draft);
        break;
      case "seat":
        planSeat(draft, intent);
        break;
    }
  }

  if (draft.changes.length > 0) planOrder(draft);
  return { steps: draft.steps, expectations: draft.expectations };
}
