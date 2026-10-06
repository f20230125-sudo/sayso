"use client";

import { Check } from "lucide-react";
import { useMemo, useState } from "react";
import { shortDay } from "@/airline/dates";
import { AIRLINE } from "@/airline/places";
import { seeded } from "@/airline/random";
import { Button } from "@/components/ui";
import type { ViewProps } from "./registry";
import { Lines } from "./simple";
import { money } from "./specs";
import { FlightLine } from "./TripCard";

// The components around the flight itself: confirming details before
// check-in, the boarding pass, the flight's status, and a refund.

const DECLARATIONS = ["My passport is valid for this trip.", "I am carrying nothing from the list of prohibited items."];

export function PassengerCheck({ props, active, onAnswer }: ViewProps<"passenger-check">) {
  const { booking } = props;
  const [ticked, setTicked] = useState<boolean[]>(DECLARATIONS.map(() => false));
  const facts = [
    ["Passenger", booking.passenger],
    ["Flight", `${booking.flight.number}, ${shortDay(booking.flight.date)} at ${booking.flight.departs}`],
    ["Seat", booking.seat ?? "Chosen in this order"],
    ["Checked bags", String(booking.bags)],
  ];

  return (
    <section className="panel p-5" aria-label="Passenger check">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt className="eyebrow">{label}</dt>
            <dd className="mt-1 text-[14px] font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      <fieldset className="mt-5 flex flex-col gap-2.5 border-t border-line pt-4" disabled={!active}>
        <legend className="sr-only">Declarations</legend>
        {DECLARATIONS.map((text, index) => (
          <label key={text} className="flex cursor-pointer items-start gap-3 text-[14px]">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
              checked={ticked[index]}
              onChange={(event) => setTicked(ticked.map((value, at) => (at === index ? event.target.checked : value)))}
            />
            {text}
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" disabled={!active || ticked.includes(false)} onClick={() => onAnswer({ confirmed: true })}>
          Check in
        </Button>
      </div>
    </section>
  );
}

export function Refund({ props, active, onAnswer }: ViewProps<"refund">) {
  const { quote, card, booking } = props;
  return (
    <section className="panel p-5" aria-label="Refund">
      <div className="eyebrow mb-2">
        Cancel {booking.flight.number} to {booking.flight.toCity}, {shortDay(booking.flight.date)}
      </div>
      <Lines lines={quote.lines} total={quote.total} totalLabel="Back to you" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">
          To {card.brand} ending {card.last4}. This cannot be undone.
        </span>
        <Button variant="outline" className="border-bad text-bad hover:bg-surface-2" disabled={!active} onClick={() => onAnswer({ confirmed: true })}>
          Cancel booking, refund {money(quote.total)}
        </Button>
      </div>
    </section>
  );
}

/** A row of bars that is the same every time for the same booking. It is decoration, not a real code. */
function Barcode({ seed }: { seed: string }) {
  const bars = useMemo(() => {
    const next = seeded(`barcode:${seed}`);
    return Array.from({ length: 46 }, () => 1 + Math.floor(next() * 3));
  }, [seed]);
  return (
    <div className="flex h-11 items-stretch gap-[2px]" aria-hidden="true">
      {bars.map((width, index) => (
        <span key={index} className={index % 2 === 0 ? "bg-fg" : "bg-transparent"} style={{ width: `${width * 1.5}px` }} />
      ))}
    </div>
  );
}

export function BoardingPass({ props }: ViewProps<"boarding-pass">) {
  const { booking, status } = props;
  const { flight } = booking;
  const boards = status.steps.find((step) => step.key === "boarding");
  const row = Number.parseInt(booking.seat ?? "0", 10);
  const facts = [
    ["Date", shortDay(flight.date)],
    ["Boards", boards?.time ?? "-"],
    ["Gate", status.gate ?? "3h before"],
    ["Seat", booking.seat ?? "-"],
    ["Zone", row <= 8 ? "A" : row <= 16 ? "B" : "C"],
  ];

  return (
    <section className="panel overflow-hidden" aria-label="Boarding pass">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <span className="eyebrow">{AIRLINE.name} · boarding pass</span>
        <span className="flex items-center gap-1.5 text-[12px] font-medium text-ok">
          <Check size={13} aria-hidden="true" />
          Checked in
        </span>
      </div>
      <div className="px-5 pb-5 pt-3">
        <div className="mb-4 text-[17px] font-semibold tracking-tight">{booking.passenger}</div>
        <FlightLine flight={flight} />
        <dl className="mt-5 grid grid-cols-5 gap-3">
          {facts.map(([label, value]) => (
            <div key={label}>
              <dt className="eyebrow">{label}</dt>
              <dd className="tabular mt-1 text-[15px] font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
      </div>
      <div className="flex items-end justify-between gap-4 border-t border-dashed border-line-strong bg-surface-2/50 px-5 py-4">
        <Barcode seed={booking.code} />
        <div className="text-right">
          <div className="eyebrow">Booking</div>
          <div className="tabular mt-0.5 font-mono text-[14px] font-semibold tracking-wider">{booking.code}</div>
        </div>
      </div>
    </section>
  );
}

export function StatusTimeline({ props }: ViewProps<"status-timeline">) {
  const { flight, status } = props;
  const late = status.delayMinutes > 0;
  return (
    <section className="panel p-5" aria-label={`Status of ${flight.number}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">
            {flight.number} · {flight.fromCity} to {flight.toCity} · {shortDay(flight.date)}
          </div>
          <div className="mt-1.5 text-[22px] font-semibold tracking-tight">{late ? `${status.delayMinutes} minutes late` : "On time"}</div>
        </div>
        <span
          className={`rounded-full border px-2.5 py-1 text-[12px] font-medium ${late ? "border-warn/40 text-warn" : "border-ok/40 text-ok"}`}
        >
          {{ scheduled: "Scheduled", "check-in": "Check-in open", closing: "Bag drop closed", boarding: "Boarding", departed: "In the air", landed: "Landed" }[status.phase]}
        </span>
      </div>

      <ol className="mt-5 flex flex-col">
        {status.steps.map((step, index) => (
          <li key={step.key} className="flex gap-3.5">
            <span className="flex flex-col items-center" aria-hidden="true">
              <span
                className={`mt-1 h-3 w-3 rounded-full border-2 ${
                  step.state === "done" ? "border-ok bg-ok" : step.state === "next" ? "border-accent bg-accent-soft" : "border-line-strong bg-surface"
                }`}
              />
              {index < status.steps.length - 1 ? <span className={`w-px flex-1 ${step.state === "done" ? "bg-ok" : "bg-line-strong"}`} /> : null}
            </span>
            <span className={`flex flex-1 items-baseline justify-between gap-4 pb-4 text-[14px] ${step.state === "later" ? "text-muted" : ""}`}>
              <span className={step.state === "next" ? "font-semibold" : ""}>
                {step.label}
                <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "next" ? " (next)" : ""}</span>
              </span>
              <span className="tabular shrink-0 text-muted">
                {shortDay(step.date)} · {step.time}
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-line pt-3 text-[13px] text-muted">
        <span>{status.terminal}</span>
        <span>{status.gate ? `Gate ${status.gate}` : "Gate shown 3 hours before"}</span>
        {status.walkMinutes ? <span>{status.walkMinutes} minute walk from security</span> : null}
      </div>
    </section>
  );
}
