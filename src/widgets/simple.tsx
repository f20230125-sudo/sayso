"use client";

import { CheckCircle2, ChevronRight } from "lucide-react";
import { shortDay } from "@/airline/dates";
import type { Quote } from "@/airline/schema";
import { Button } from "@/components/ui";
import type { ViewProps } from "./registry";
import { money } from "./specs";
import { TripCard } from "./TripCard";

// The smaller components: the list of trips, the "which trip?" question, the
// price summary and the receipt.

export function Trips({ props }: ViewProps<"trips">) {
  return (
    <div className="flex flex-col gap-3">
      {props.bookings.map((booking) => (
        <TripCard key={booking.code} booking={booking} />
      ))}
    </div>
  );
}

export function TripChooser({ props, active, onAnswer }: ViewProps<"trip-chooser">) {
  return (
    <ul className="panel divide-y divide-line overflow-hidden" aria-label="Your trips">
      {props.bookings.map((booking) => {
        const { flight } = booking;
        return (
          <li key={booking.code}>
            <button
              type="button"
              disabled={!active}
              onClick={() => onAnswer({ booking })}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-medium">
                  {flight.fromCity} to {flight.toCity}
                </span>
                <span className="tabular mt-0.5 block text-[13px] text-muted">
                  {shortDay(flight.date)} · {flight.departs} · {flight.number}
                </span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-faint" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Amount({ amount }: { amount: number }) {
  return (
    <span className="tabular whitespace-nowrap">
      {amount < 0 ? "− " : ""}
      {money(amount)}
    </span>
  );
}

function Lines({ lines, total, totalLabel }: { lines: Quote["lines"]; total: number; totalLabel: string }) {
  return (
    <dl className="text-[14px]">
      {lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-6 py-1.5">
          <dt className="text-muted">{line.label}</dt>
          <dd>{line.amount === 0 ? <span className="text-muted">No charge</span> : <Amount amount={line.amount} />}</dd>
        </div>
      ))}
      <div className="mt-2 flex items-baseline justify-between gap-6 border-t border-line pt-3 text-[15px] font-semibold">
        <dt>{totalLabel}</dt>
        <dd>
          <Amount amount={total} />
        </dd>
      </div>
    </dl>
  );
}

export function PriceSummary({ props, active, onAnswer }: ViewProps<"price-summary">) {
  const { quote, card } = props;
  const owed = quote.total > 0;
  const back = quote.total < 0;
  return (
    <section className="panel p-5" aria-label="Price summary">
      <div className="eyebrow mb-2">{back ? "Refund" : "Price"}</div>
      <Lines lines={quote.lines} total={quote.total} totalLabel={back ? "Back to you" : owed ? "To pay now" : "Total"} />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          {owed || back ? `${card.brand} ending ${card.last4}` : "Nothing to pay"}
          <span className="ml-2 text-faint">Demo: no real money moves.</span>
        </span>
        <Button variant="primary" disabled={!active} onClick={() => onAnswer({ confirmed: true })}>
          {owed ? `Pay ${money(quote.total)}` : back ? `Refund ${money(quote.total)}` : "Confirm"}
        </Button>
      </div>
    </section>
  );
}

export function Receipt({ props }: ViewProps<"receipt">) {
  const { receipt, booking } = props;
  return (
    <section className="panel overflow-hidden" aria-label="Receipt">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[15px] font-medium">
            <CheckCircle2 size={18} className="text-ok" aria-hidden="true" />
            {receipt.total > 0 ? "Paid" : receipt.total < 0 ? "Refunded" : "Confirmed"}
          </span>
          <span className="eyebrow" title="Receipt number">
            {receipt.id}
          </span>
        </div>
        <Lines lines={receipt.lines} total={receipt.total} totalLabel={receipt.total < 0 ? "Back to you" : "Total"} />
      </div>
      <div className="border-t border-line bg-surface-2/50 p-5">
        <div className="eyebrow mb-3">Your booking now</div>
        <TripCard booking={booking} bare />
      </div>
    </section>
  );
}
