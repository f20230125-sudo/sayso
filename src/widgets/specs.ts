import { z } from "zod";
import { shortDay } from "@/airline/dates";
import { bookingSchema, cardSchema, flightSchema, quoteSchema, receiptSchema, seatKindSchema, seatMapSchema } from "@/airline/schema";
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
