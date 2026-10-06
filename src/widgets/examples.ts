import { demoAccount, upcoming } from "@/airline/account";
import { addDays, shortDay, type IsoDate } from "@/airline/dates";
import { cheapestByDay, flightsOn } from "@/airline/flights";
import { DESTINATIONS } from "@/airline/places";
import { FEES, MAX_BAGS, placeOrder, quoteFor } from "@/airline/pricing";
import type { Change, Quote } from "@/airline/schema";
import { seatMapOf } from "@/airline/seats";
import { statusOf } from "@/airline/status";
import type { Json } from "@/agent/reference";
import { WIDGETS, type WidgetAnswer, type WidgetProps, type WidgetType } from "./specs";

// One worked example of every component, for the gallery page and for the
// tests. The examples are built from the same airline code the desk uses, so
// what the gallery shows is what a conversation would show.

export type Example = {
  type: WidgetType;
  props: Json;
  /** A choice a traveller might make, for components that ask for one. */
  answer: Json | null;
};

type Examples = { [T in WidgetType]: { props: WidgetProps<T>; answer: WidgetAnswer<T> } };

export function examples(today: IsoDate, now: Date): Example[] {
  const account = demoAccount(today);
  const bookings = upcoming(account, today);
  const [mumbai, london, istanbul] = bookings;
  const { card } = account.traveller;

  const days = cheapestByDay(london.flight.from, london.flight.to, addDays(london.flight.date, -3), 7);
  const flights = flightsOn(london.flight.from, london.flight.to, london.flight.date);
  const map = seatMapOf(london.flight.id);
  const seat = map.rows.flatMap((row) => row.seats).find((entry) => !entry.taken && entry.kinds.length === 1 && entry.kinds[0] === "window");
  if (!seat) throw new Error("The example cabin has no free window seat.");

  const quoted = (booking: typeof london, changes: Change[]): Quote => {
    const priced = quoteFor(booking, changes);
    if (!priced.ok) throw new Error(priced.message);
    return priced.quote;
  };
  const changes: Change[] = [
    { type: "seat", seat: seat.id },
    { type: "bags", count: london.bags + 1 },
  ];
  const quote = quoted(london, changes);
  const placed = placeOrder(london, changes, quote.total, now);
  if (!placed.ok) throw new Error(placed.message);
  const status = statusOf(mumbai.flight, now);
  const paris = addDays(today, 10);

  const all: Examples = {
    trips: { props: { bookings }, answer: null },
    "trip-chooser": { props: { bookings }, answer: { booking: london } },
    "flight-search": {
      props: { destinations: DESTINATIONS.map((place) => ({ code: place.code, city: place.city })), earliest: today, suggested: addDays(today, 7) },
      answer: { to: "CDG", toCity: "Paris", date: paris, label: shortDay(paris) },
    },
    "date-strip": { props: { days, current: london.flight.date, currentPrice: london.flight.price }, answer: { date: days[5].date, label: shortDay(days[5].date) } },
    "flight-list": { props: { flights, current: london.flight }, answer: { flight: flights.find((flight) => flight.id !== london.flight.id) ?? flights[0] } },
    "seat-map": { props: { map, flight: london.flight, wish: "window", current: london.seat, preselect: null }, answer: { seat: seat.id, kinds: seat.kinds, price: seat.price } },
    "bag-stepper": { props: { current: istanbul.bags, add: 1, max: MAX_BAGS, price: FEES.bag }, answer: { count: istanbul.bags + 2, added: 2 } },
    "passenger-check": { props: { booking: mumbai }, answer: { confirmed: true } },
    refund: { props: { quote: quoted(istanbul, [{ type: "cancel" }]), card, booking: istanbul }, answer: { confirmed: true } },
    "price-summary": { props: { quote, card }, answer: { confirmed: true } },
    receipt: { props: placed.result, answer: null },
    "boarding-pass": { props: { booking: { ...mumbai, checkedIn: true }, status }, answer: null },
    "status-timeline": { props: { flight: mumbai.flight, status }, answer: null },
  };

  return (Object.keys(WIDGETS) as WidgetType[]).map((type) => ({ type, props: all[type].props as unknown as Json, answer: all[type].answer as Json | null }));
}
