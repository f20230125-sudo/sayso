"use client";

import { Check } from "lucide-react";
import { shortDay } from "@/airline/dates";
import type { Quote } from "@/airline/schema";
import { Button, Perforation } from "@/components/ui";
import type { ViewProps } from "./registry";
import { money } from "./specs";
import { TripCard } from "./TripCard";

// The smaller components: the list of trips, the "which trip?" question, the
// price summary and the receipt.

export function Trips({ props }: ViewProps<"trips">) {
  return (
    <div className="flex flex-col gap-4">
      {props.bookings.map((booking) => (
        <TripCard key={booking.code} booking={booking} />
      ))}
    </div>
  );
}

export function TripChooser({ props, active, onAnswer }: ViewProps<"trip-chooser">) {
  return (
    <ul className="doc divide-y divide-rule overflow-hidden" aria-label="Your trips">
      {props.bookings.map((booking) => {
        const { flight } = booking;
        return (
          <li key={booking.code}>
            <button
              type="button"
              aria-disabled={!active || undefined}
              onClick={() => active && onAnswer({ booking })}
              className={`block min-h-14 w-full px-5 py-3 text-left transition-colors duration-150 ${active ? "cursor-pointer hover:bg-paper-2" : "cursor-default"}`}
            >
              <span className="block text-[17px] font-bold leading-snug">
                {flight.fromCity} to {flight.toCity}
              </span>
              <span className="mt-0.5 block text-[13px] text-ink-2">
                {shortDay(flight.date)}, {flight.departs}, {flight.number}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function Amount({ amount }: { amount: number }) {
  return (
    <span className="whitespace-nowrap">
      {amount < 0 ? "− " : ""}
      {money(amount)}
    </span>
  );
}

/** Receipt lines as a ruled list: what each is, what it costs, and the total on a heavier rule. */
export function Lines({ lines, total, totalLabel }: { lines: Quote["lines"]; total: number; totalLabel: string }) {
  return (
    <dl className="text-[15px]">
      {lines.map((line) => (
        <div key={line.label} className="flex items-baseline justify-between gap-6 border-b border-rule py-2">
          <dt className="text-ink-2">{line.label}</dt>
          <dd>{line.amount === 0 ? <span className="text-ink-3">No charge</span> : <Amount amount={line.amount} />}</dd>
        </div>
      ))}
      <div className="flex items-baseline justify-between gap-6 pt-3 text-[17px] font-bold">
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
    <section className="doc p-5" aria-label="Price summary">
      <h3 className="mb-1 text-[15px] font-bold">{back ? "Refund" : "Price"}</h3>
      <Lines lines={quote.lines} total={quote.total} totalLabel={back ? "Back to you" : owed ? "To pay now" : "Total"} />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <span className="text-[13px] text-ink-2">
          {owed || back ? `${card.brand} ending ${card.last4}` : "Nothing to pay"}
          <span className="ml-3 text-ink-3">Demo: no real money moves.</span>
        </span>
        <Button variant="primary" disabled={!active} onClick={() => onAnswer({ confirmed: true })}>
          {owed ? `Pay ${money(quote.total)}` : back ? `Refund ${money(quote.total)}` : "Confirm"}
        </Button>
      </div>
    </section>
  );
}

/** The receipt: the lines above the tear-off, the booking as it stands now below it. */
export function Receipt({ props }: ViewProps<"receipt">) {
  const { receipt, booking } = props;
  return (
    <section className="doc" aria-label="Receipt">
      <div className="p-5">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 text-[17px] font-bold">
            <Check size={19} strokeWidth={2.75} aria-hidden="true" />
            {receipt.total > 0 ? "Paid" : receipt.total < 0 ? "Refunded" : "Confirmed"}
          </span>
          <code className="font-mono text-[12.5px] text-ink-2" title="Receipt number">
            {receipt.id}
          </code>
        </div>
        <Lines lines={receipt.lines} total={receipt.total} totalLabel={receipt.total < 0 ? "Back to you" : "Total"} />
      </div>
      <Perforation />
      <div className="p-5">
        <h3 className="mb-3 text-[15px] font-bold">Your booking now</h3>
        <TripCard booking={booking} bare />
      </div>
    </section>
  );
}
