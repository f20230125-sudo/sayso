import { findFlight } from "./flights";
import { code, seeded } from "./random";
import type { Booking, Change, Flight, OrderResult, Quote } from "./schema";
import { describeSeat, findSeat, seatMapOf } from "./seats";

// What an order costs, and what a booking looks like after it.
//
// Both the price the visitor is shown and the price they are charged come
// from `quoteFor`. The order route calls it again instead of believing the
// total the browser sends, so a changed number in the browser changes nothing.

export const FEES = { change: 150, cancel: 200, bag: 120 } as const;
export const MAX_BAGS = 5;

export type Refusal = { ok: false; status: number; code: string; message: string };
type Priced = { ok: true; quote: Quote; after: Booking };

const refuse = (status: number, code: string, message: string): Refusal => ({ ok: false, status, code, message });

function newBooking(flight: Flight, passenger: string): Booking {
  return { code: "", passenger, flight, seat: null, bags: 0, checkedIn: false, status: "confirmed", paid: 0 };
}

/**
 * Price a list of changes and work out the booking they lead to. The changes
 * are applied in a fixed order (a new flight before the seat on it), whatever
 * order they arrive in.
 */
export function quoteFor(booking: Booking | null, changes: readonly Change[]): Priced | Refusal {
  const lines: Quote["lines"] = [];
  const of = <T extends Change["type"]>(type: T) => changes.filter((change): change is Extract<Change, { type: T }> => change.type === type);
  for (const type of ["move", "seat", "bags", "cancel", "check-in", "book"] as const) {
    if (of(type).length > 1) return refuse(400, "duplicate_change", `An order can hold one "${type}" change, not several.`);
  }

  const [book] = of("book");
  let after: Booking;
  if (book) {
    if (booking) return refuse(400, "bad_order", "A new booking cannot be combined with changes to an existing one.");
    const flight = findFlight(book.flightId);
    if (!flight) return refuse(404, "no_such_flight", `There is no flight ${book.flightId}.`);
    after = newBooking(flight, book.passenger);
    lines.push({ label: `Fare, ${flight.number} ${flight.fromCity} to ${flight.toCity}`, amount: flight.price });
  } else {
    if (!booking) return refuse(400, "bad_order", "Say which booking to change.");
    if (booking.status === "cancelled") return refuse(409, "cancelled", "That booking has been cancelled.");
    after = { ...booking };
  }

  const [cancel] = of("cancel");
  if (cancel) {
    if (changes.length > 1) return refuse(400, "bad_order", "Cancelling cannot be combined with other changes.");
    const fee = Math.min(FEES.cancel, after.paid);
    lines.push({ label: "Refund of what you paid", amount: -after.paid });
    lines.push({ label: "Cancellation fee", amount: fee });
    after = { ...after, status: "cancelled", checkedIn: false };
  }

  const [move] = of("move");
  if (move) {
    const flight = findFlight(move.toFlightId);
    if (!flight) return refuse(404, "no_such_flight", `There is no flight ${move.toFlightId}.`);
    if (flight.from !== after.flight.from || flight.to !== after.flight.to) {
      return refuse(409, "different_route", "A booking can only move to another flight on the same route.");
    }
    if (flight.id === after.flight.id) return refuse(409, "same_flight", "That is the flight you are already on.");
    lines.push({ label: `Fare difference, ${after.flight.number} to ${flight.number}`, amount: flight.price - after.flight.price });
    lines.push({ label: "Change fee", amount: FEES.change });
    // The old seat belongs to the old aircraft.
    after = { ...after, flight, seat: null, checkedIn: false };
  }

  const [seat] = of("seat");
  if (seat) {
    const chosen = findSeat(seatMapOf(after.flight.id), seat.seat);
    if (!chosen) return refuse(404, "no_such_seat", `There is no seat ${seat.seat} on ${after.flight.number}.`);
    if (chosen.id === after.seat) return refuse(409, "same_seat", `You already have seat ${chosen.id}.`);
    if (chosen.taken) return refuse(409, "seat_taken", `Seat ${chosen.id} has just been taken. Choose another.`);
    lines.push({ label: `Seat ${chosen.id}, ${describeSeat(chosen.kinds)}`, amount: chosen.price });
    after = { ...after, seat: chosen.id };
  }

  const [bags] = of("bags");
  if (bags) {
    if (bags.count > MAX_BAGS) return refuse(409, "too_many_bags", `A booking can hold at most ${MAX_BAGS} checked bags.`);
    const extra = bags.count - after.bags;
    if (extra === 0) return refuse(409, "same_bags", `You already have ${after.bags} checked ${after.bags === 1 ? "bag" : "bags"}.`);
    // Taking a bag off is allowed, and is not refunded.
    lines.push({ label: extra > 0 ? `${extra} extra checked ${extra === 1 ? "bag" : "bags"}` : "Fewer checked bags", amount: Math.max(0, extra) * FEES.bag });
    after = { ...after, bags: bags.count };
  }

  const [checkIn] = of("check-in");
  if (checkIn) {
    if (after.checkedIn) return refuse(409, "checked_in", "You are already checked in for this flight.");
    if (!after.seat) return refuse(409, "no_seat", "Choose a seat before checking in.");
    lines.push({ label: "Online check-in", amount: 0 });
    after = { ...after, checkedIn: true };
  }

  const total = lines.reduce((sum, line) => sum + line.amount, 0);
  return { ok: true, quote: { lines, total, currency: "AED" }, after: { ...after, paid: Math.max(0, after.paid + total) } };
}

/**
 * Carry an order out: price it again, refuse if that is not the total the
 * visitor agreed to, and hand back the booking as it now stands.
 */
export function placeOrder(
  booking: Booking | null,
  changes: readonly Change[],
  expectedTotal: number,
  at: Date,
): { ok: true; result: OrderResult } | Refusal {
  const priced = quoteFor(booking, changes);
  if (!priced.ok) return priced;
  if (priced.quote.total !== expectedTotal) {
    return refuse(409, "price_changed", `The price is now AED ${priced.quote.total}, not AED ${expectedTotal}. Nothing was charged.`);
  }

  const next = seeded(`order:${at.toISOString()}:${booking?.code ?? "new"}:${JSON.stringify(changes)}`);
  const after = priced.after.code === "" ? { ...priced.after, code: code(next, 6) } : priced.after;
  return {
    ok: true,
    result: {
      booking: after,
      receipt: {
        id: `R-${code(next, 6)}`,
        at: at.toISOString(),
        bookingCode: after.code,
        lines: priced.quote.lines,
        total: priced.quote.total,
        currency: "AED",
      },
    },
  };
}
