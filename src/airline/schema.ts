import { z } from "zod";
import { isIsoDate } from "./dates";

// The shapes the airline deals in. Each is a Zod schema, so the same
// definition checks what a route receives, checks what a route sends back,
// and gives the rest of the code its TypeScript types.

export const isoDateSchema = z.string().refine(isIsoDate, "Expected a date such as 2026-10-15.");
const timeSchema = z.string().regex(/^\d{2}:\d{2}$/);
const airportCode = z.string().regex(/^[A-Z]{3}$/);

export const flightSchema = z.object({
  /** Number and date together, such as "JN204_2026-10-15". Enough to work the whole flight out again. */
  id: z.string(),
  number: z.string(),
  from: airportCode,
  to: airportCode,
  fromCity: z.string(),
  toCity: z.string(),
  /** The day it leaves, at the airport it leaves from. */
  date: isoDateSchema,
  /** Local time at the airport it leaves from. */
  departs: timeSchema,
  /** Local time at the airport it lands at. */
  arrives: timeSchema,
  /** How many days after `date` it lands, by the local calendar there. */
  arrivesDayOffset: z.number().int().min(-1).max(2),
  minutes: z.number().int().positive(),
  /** One-way fare in AED. */
  price: z.number().int().nonnegative(),
  seatsLeft: z.number().int().nonnegative(),
});
export type Flight = z.infer<typeof flightSchema>;

export const SEAT_KINDS = ["window", "aisle", "middle", "legroom", "front"] as const;
export const seatKindSchema = z.enum(SEAT_KINDS);
export type SeatKind = z.infer<typeof seatKindSchema>;

export const seatSchema = z.object({
  /** Row and letter, such as "14A". */
  id: z.string().regex(/^\d{1,2}[A-F]$/),
  row: z.number().int().positive(),
  letter: z.string().length(1),
  kinds: z.array(seatKindSchema),
  price: z.number().int().nonnegative(),
  taken: z.boolean(),
});
export type Seat = z.infer<typeof seatSchema>;

export const seatMapSchema = z.object({
  flightId: z.string(),
  letters: z.array(z.string()),
  /** The aisle runs after this many seats in a row. */
  aisleAfter: z.number().int().positive(),
  rows: z.array(z.object({ row: z.number().int().positive(), exit: z.boolean(), seats: z.array(seatSchema) })),
});
export type SeatMap = z.infer<typeof seatMapSchema>;

export const bookingSchema = z.object({
  /** The six-character reference on the ticket. */
  code: z.string(),
  passenger: z.string(),
  flight: flightSchema,
  seat: z.string().nullable(),
  /** Checked bags. */
  bags: z.number().int().min(0).max(5),
  checkedIn: z.boolean(),
  status: z.enum(["confirmed", "cancelled"]),
  /** Everything paid for this booking so far, in AED. */
  paid: z.number().int().nonnegative(),
});
export type Booking = z.infer<typeof bookingSchema>;

/** One thing to do to a booking. An order is a list of these, paid for together. */
export const changeSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move"), toFlightId: z.string() }),
  z.object({ type: z.literal("seat"), seat: z.string() }),
  /** `count` is the new total of checked bags, not how many to add. */
  z.object({ type: z.literal("bags"), count: z.number().int().min(0).max(5) }),
  z.object({ type: z.literal("cancel") }),
  z.object({ type: z.literal("check-in") }),
  z.object({
    type: z.literal("book"),
    flightId: z.string(),
    passenger: z.string().min(1).max(80),
  }),
]);
export type Change = z.infer<typeof changeSchema>;

export const quoteSchema = z.object({
  lines: z.array(z.object({ label: z.string(), amount: z.number().int() })),
  /** What is due now. Negative means money comes back. */
  total: z.number().int(),
  currency: z.literal("AED"),
});
export type Quote = z.infer<typeof quoteSchema>;

export const cardSchema = z.object({ brand: z.string(), last4: z.string().regex(/^\d{4}$/) });
export type Card = z.infer<typeof cardSchema>;

export const receiptSchema = z.object({
  id: z.string(),
  /** The moment the order went through. */
  at: z.string(),
  bookingCode: z.string(),
  lines: quoteSchema.shape.lines,
  total: z.number().int(),
  currency: z.literal("AED"),
});
export type Receipt = z.infer<typeof receiptSchema>;

export const quoteRequestSchema = z.object({
  /** Null only when the order books a new flight. */
  booking: bookingSchema.nullable(),
  changes: z.array(changeSchema).min(1).max(6),
});
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;

export const orderRequestSchema = quoteRequestSchema.extend({
  /** The total the visitor agreed to. The server works the price out again and refuses if it differs. */
  expectedTotal: z.number().int(),
});
export type OrderRequest = z.infer<typeof orderRequestSchema>;

export const orderResultSchema = z.object({ booking: bookingSchema, receipt: receiptSchema });
export type OrderResult = z.infer<typeof orderResultSchema>;

export const flightStatusSchema = z.object({
  flightId: z.string(),
  phase: z.enum(["scheduled", "check-in", "closing", "boarding", "departed", "landed"]),
  /** A few words to finish the sentence "JN 203 is ...". */
  headline: z.string(),
  delayMinutes: z.number().int().nonnegative(),
  terminal: z.string(),
  /** Null until the gate is announced, three hours before leaving. */
  gate: z.string().nullable(),
  /** How long the walk to the gate takes. Null until the gate is announced. */
  walkMinutes: z.number().int().nullable(),
  /** From check-in to landing, each at the local time of the airport it happens at. */
  steps: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      date: isoDateSchema,
      time: timeSchema,
      /** "done" has happened, "next" is the one to come, "later" follows it. */
      state: z.enum(["done", "next", "later"]),
    }),
  ),
});
export type FlightStatus = z.infer<typeof flightStatusSchema>;

export const calendarDaySchema = z.object({ date: isoDateSchema, price: z.number().int(), flights: z.number().int() });

export const paymentSchema = z.object({
  id: z.string(),
  date: isoDateSchema,
  /** Negative for a refund. */
  amount: z.number().int(),
  what: z.string(),
  route: z.string(),
  bookingCode: z.string(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const accountSchema = z.object({
  traveller: z.object({ name: z.string(), tier: z.string(), card: cardSchema }),
  bookings: z.array(bookingSchema),
  payments: z.array(paymentSchema),
  /** The day the demo trips were made. They are dated from this day. */
  seededOn: isoDateSchema,
});
export type Account = z.infer<typeof accountSchema>;

/** What a route sends when it cannot do what was asked. */
export type ApiError = { error: { code: string; message: string } };

export const apiErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });
