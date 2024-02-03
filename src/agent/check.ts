import { shortDay } from "@/airline/dates";
import { cityOf } from "@/airline/places";
import type { Flight, OrderResult, Quote, SeatKind } from "@/airline/schema";
import { seatPhrase } from "@/airline/seats";
import { money } from "@/widgets/specs";
import type { Check, Expectation, RunState } from "./types";

// The last of the four steps: compare what happened with what was asked.
//
// The plan carries its own expectations, written down before anything ran.
// Each one is checked against the results, in code. A check that does not hold
// is shown to the traveller as plainly as one that does.

const SEAT_WORDS: Record<SeatKind, string> = {
  window: "a window seat",
  aisle: "an aisle seat",
  middle: "a middle seat",
  legroom: "a seat with extra legroom",
  front: "a seat at the front",
};

type SeatAnswer = { seat: string; kinds: SeatKind[]; price: number };

function check(expectation: Expectation, run: RunState): Check | null {
  const order = run.results.order as OrderResult | undefined;
  const flightAt = (step: string) => (run.results[step] as { flight: Flight } | undefined)?.flight;

  switch (expectation.kind) {
    case "seat-kind": {
      const picked = run.results[expectation.seatStep] as SeatAnswer | undefined;
      if (!picked) return null;
      const pass = picked.kinds.includes(expectation.wish);
      return {
        pass,
        label: pass
          ? `You asked for ${SEAT_WORDS[expectation.wish]}. ${picked.seat} is one.`
          : `You asked for ${SEAT_WORDS[expectation.wish]}, and picked ${picked.seat}, which is ${seatPhrase(picked.kinds)}.`,
      };
    }
    case "seat-on-booking": {
      const picked = run.results[expectation.seatStep] as SeatAnswer | undefined;
      if (!picked || !order) return null;
      const pass = order.booking.seat === picked.seat;
      return { pass, label: pass ? `Your booking now shows seat ${picked.seat}.` : `Your booking shows seat ${order.booking.seat ?? "none"}, not ${picked.seat}.` };
    }
    case "date-within": {
      const flight = flightAt(expectation.flightStep);
      if (!flight) return null;
      const { from, to } = expectation;
      const pass = flight.date >= from && flight.date <= to;
      const asked = from === to ? `to fly on ${shortDay(from)}` : `for a day from ${shortDay(from)} to ${shortDay(to)}`;
      return {
        pass,
        label: pass
          ? `You asked ${asked}. ${flight.number} leaves on ${shortDay(flight.date)}.`
          : `You asked ${asked}, and picked ${flight.number} on ${shortDay(flight.date)}, which is outside that.`,
      };
    }
    case "flight-on-booking": {
      const flight = flightAt(expectation.flightStep);
      if (!flight || !order) return null;
      const pass = order.booking.flight.id === flight.id;
      return {
        pass,
        label: pass
          ? `Your booking is now on ${flight.number}, ${shortDay(flight.date)} at ${flight.departs}.`
          : `Your booking is on ${order.booking.flight.number}, not ${flight.number}.`,
      };
    }
    case "goes-to": {
      const flight = flightAt(expectation.flightStep);
      if (!flight) return null;
      const pass = flight.to === expectation.place || flight.from === expectation.place;
      const city = cityOf(expectation.place);
      return { pass, label: pass ? `You asked for ${city}. ${flight.number} flies there.` : `You asked for ${city}, and ${flight.number} flies to ${flight.toCity}.` };
    }
    case "bags-on-booking": {
      const picked = run.results[expectation.bagsStep] as { count: number } | undefined;
      if (!picked || !order) return null;
      const pass = order.booking.bags === picked.count;
      const has = `${order.booking.bags} checked ${order.booking.bags === 1 ? "bag" : "bags"}`;
      return { pass, label: pass ? `Your booking now has ${has}.` : `Your booking has ${has}, not ${picked.count}.` };
    }
    case "checked-in": {
      if (!order) return null;
      const pass = order.booking.checkedIn;
      return { pass, label: pass ? `You are checked in for ${order.booking.flight.number}.` : `You are not checked in for ${order.booking.flight.number}.` };
    }
    case "cancelled": {
      if (!order) return null;
      const pass = order.booking.status === "cancelled";
      return { pass, label: pass ? `Booking ${order.booking.code} is cancelled.` : `Booking ${order.booking.code} is still active.` };
    }
    case "charged-as-quoted": {
      const quote = run.results.quote as Quote | undefined;
      if (!quote || !order) return null;
      const pass = order.receipt.total === quote.total;
      if (!pass) return { pass, label: `You agreed to ${money(quote.total)} and the receipt says ${money(order.receipt.total)}.` };
      if (quote.total === 0) return { pass, label: "Nothing was charged, as quoted." };
      return { pass, label: `${quote.total > 0 ? "Charged" : "Refunded"} ${money(quote.total)}, the amount you agreed to.` };
    }
  }
}

export function runChecks(run: RunState): Check[] {
  return run.expectations.map((expectation) => check(expectation, run)).filter((result): result is Check => result !== null);
}
