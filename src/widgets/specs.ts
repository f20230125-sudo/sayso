import { z } from "zod";
import { shortDay } from "@/airline/dates";
import {
  bookingSchema,
  calendarDaySchema,
  cardSchema,
  flightSchema,
  flightStatusSchema,
  isoDateSchema,
  quoteSchema,
  receiptSchema,
  seatKindSchema,
  seatMapSchema,
} from "@/airline/schema";
import { describeSeat } from "@/airline/seats";

// The pieces of screen a reply may be built from.
//
// This is the whole list: a plan can only ask for something that is here, and
// only with the properties its schema allows. Each entry is used four ways:
// to check a plan before anything is drawn, to describe the component to a
// model, to document it on the gallery page, and to type the React component.
//
// This file is plain TypeScript with no React in it, so the agent and the
// server can read it. The components themselves are in registry.tsx.

export type WidgetSpec = {
  title: string;
  /** What it is for, in a sentence a model or a person can use. */
  description: string;
  props: z.ZodType;
  /** What the visitor's choice looks like. Null when there is nothing to choose. */
  answer: z.ZodType | null;
};

const spec = <P extends z.ZodType, A extends z.ZodType | null>(entry: { title: string; description: string; props: P; answer: A }) => entry;

export const WIDGETS = {
  trips: spec({
    title: "Trips",
    description: "The traveller's upcoming trips, one card each. Nothing to choose.",
    props: z.object({ bookings: z.array(bookingSchema) }),
    answer: null,
  }),
  "trip-chooser": spec({
    title: "Which trip?",
    description: "Asks which of several trips a request is about. Used when the request could mean more than one.",
    props: z.object({ bookings: z.array(bookingSchema).min(1) }),
    answer: z.object({ booking: bookingSchema }),
  }),
  "flight-search": spec({
    title: "Flight search",
    description: "Asks where to fly and on which day, when a request to book did not say.",
    props: z.object({
      destinations: z.array(z.object({ code: z.string(), city: z.string() })).min(1),
      /** The earliest day that can be chosen. */
      earliest: isoDateSchema,
      /** The day to start with. */
      suggested: isoDateSchema,
    }),
    answer: z.object({ to: z.string(), toCity: z.string(), date: isoDateSchema, label: z.string() }),
  }),
  "date-strip": spec({
    title: "Days",
    description: "A run of days, each with its lowest fare. The traveller picks one. The day they fly now is marked.",
    props: z.object({
      days: z.array(calendarDaySchema),
      /** The day of the flight being moved, if one is. */
      current: isoDateSchema.nullable(),
      /** What that flight cost, so each day can show the difference. */
      currentPrice: z.number().int().nullable(),
    }),
    answer: z.object({ date: isoDateSchema, label: z.string() }),
  }),
  "flight-list": spec({
    title: "Flights",
    description: "The flights on one day. The traveller picks one. When a flight is being moved, each shows the difference in fare.",
    props: z.object({ flights: z.array(flightSchema), current: flightSchema.nullable() }),
    answer: z.object({ flight: flightSchema }),
  }),
  "seat-map": spec({
    title: "Seat map",
    description: "The cabin of one flight. The traveller picks a free seat. Seats that match what they asked for are marked.",
    props: z.object({
      map: seatMapSchema,
      flight: flightSchema,
      /** The kind of seat the traveller asked for, if they said. */
      wish: seatKindSchema.nullable(),
      /** The seat they hold now on this flight. */
      current: z.string().nullable(),
      /** A seat they named, to start with it selected. */
      preselect: z.string().nullable(),
    }),
    answer: z.object({ seat: z.string(), kinds: z.array(seatKindSchema), price: z.number().int() }),
  }),
  "bag-stepper": spec({
    title: "Bags",
    description: "Asks how many checked bags to add, with the price of each.",
    props: z.object({
      /** Checked bags on the booking now. */
      current: z.number().int().min(0),
      /** How many to start with. */
      add: z.number().int().min(1),
      /** The most a booking can hold in all. */
      max: z.number().int().min(1),
      /** The price of one bag, in AED. */
      price: z.number().int().min(0),
    }),
    /** `count` is the new total, `added` how many more than before. */
    answer: z.object({ count: z.number().int().min(0), added: z.number().int().min(1) }),
  }),
  "passenger-check": spec({
    title: "Passenger check",
    description: "The details and declarations a traveller confirms before checking in.",
    props: z.object({ booking: bookingSchema }),
    answer: z.object({ confirmed: z.literal(true) }),
  }),
  refund: spec({
    title: "Refund",
    description: "What comes back if a booking is cancelled, with one button to cancel it.",
    props: z.object({ quote: quoteSchema, card: cardSchema, booking: bookingSchema }),
    answer: z.object({ confirmed: z.literal(true) }),
  }),
  "price-summary": spec({
    title: "Price summary",
    description: "The lines of an order and its total, with one button to pay or confirm.",
    props: z.object({ quote: quoteSchema, card: cardSchema }),
    answer: z.object({ confirmed: z.literal(true) }),
  }),
  receipt: spec({
    title: "Receipt",
    description: "Shown once an order has gone through: what changed, what was charged, and the booking as it now stands.",
    props: z.object({ receipt: receiptSchema, booking: bookingSchema }),
    answer: null,
  }),
  "boarding-pass": spec({
    title: "Boarding pass",
    description: "The pass for a flight the traveller has checked in for: seat, gate and boarding time.",
    props: z.object({ booking: bookingSchema, status: flightStatusSchema }),
    answer: null,
  }),
  "status-timeline": spec({
    title: "Flight status",
    description: "Where a flight stands: on time or late, the gate, and each step from check-in to landing.",
    props: z.object({ flight: flightSchema, status: flightStatusSchema }),
    answer: null,
  }),
} satisfies Record<string, WidgetSpec>;

export type WidgetType = keyof typeof WIDGETS;
export type WidgetProps<T extends WidgetType> = z.infer<(typeof WIDGETS)[T]["props"]>;
export type WidgetAnswer<T extends WidgetType> = (typeof WIDGETS)[T]["answer"] extends z.ZodType ? z.infer<(typeof WIDGETS)[T]["answer"]> : null;

export const WIDGET_TYPES = Object.keys(WIDGETS) as WidgetType[];

export function isWidgetType(value: string): value is WidgetType {
  return Object.prototype.hasOwnProperty.call(WIDGETS, value);
}

export function money(amount: number): string {
  return `AED ${Math.abs(amount).toLocaleString("en-US")}`;
}

/** The one line a component folds into once the visitor has answered it. */
export function summaryOf(type: WidgetType, props: unknown, answer: unknown): string {
  switch (type) {
    case "trip-chooser": {
      const { booking } = answer as WidgetAnswer<"trip-chooser">;
      return `${booking.flight.toCity}, ${shortDay(booking.flight.date)}`;
    }
    case "seat-map": {
      const { seat, kinds, price } = answer as WidgetAnswer<"seat-map">;
      return `Seat ${seat}, ${describeSeat(kinds)}${price > 0 ? `, ${money(price)}` : ", no charge"}`;
    }
    case "flight-search": {
      const { toCity, label } = answer as WidgetAnswer<"flight-search">;
      return `${toCity}, ${label}`;
    }
    case "date-strip":
      return (answer as WidgetAnswer<"date-strip">).label;
    case "flight-list": {
      const { flight } = answer as WidgetAnswer<"flight-list">;
      return `${flight.number}, ${flight.departs} to ${flight.arrives}`;
    }
    case "bag-stepper": {
      const { added } = answer as WidgetAnswer<"bag-stepper">;
      return `${added} more checked ${added === 1 ? "bag" : "bags"}`;
    }
    case "passenger-check":
      return "Details confirmed";
    case "refund": {
      const { quote, card } = props as WidgetProps<"refund">;
      return `Cancelled, ${money(quote.total)} back to ${card.brand} ending ${card.last4}`;
    }
    case "price-summary": {
      const { quote, card } = props as WidgetProps<"price-summary">;
      if (quote.total > 0) return `Paid ${money(quote.total)} with ${card.brand} ending ${card.last4}`;
      if (quote.total < 0) return `Refund of ${money(quote.total)} to ${card.brand} ending ${card.last4}`;
      return "Confirmed, no charge";
    }
    default:
      return "";
  }
}
