import type { OrderResult, Quote, SeatKind } from "@/airline/schema";
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
