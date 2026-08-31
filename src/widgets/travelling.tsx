"use client";

import { Check, CircleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { shortDay } from "@/airline/dates";
import { AIRLINE } from "@/airline/places";
import { seeded } from "@/airline/random";
import { Button, Field, Perforation } from "@/components/ui";
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
  const ready = !ticked.includes(false);

  return (
    <section className="doc p-5" aria-label="Passenger check">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <Field key={label} label={label} value={value} />
        ))}
      </dl>
      <fieldset className="mt-5 flex flex-col gap-1 border-t border-rule pt-3" disabled={!active}>
        <legend className="sr-only">Declarations</legend>
        {DECLARATIONS.map((text, index) => (
          <label key={text} className="flex min-h-11 cursor-pointer items-center gap-3 text-[15px]">
            <input
              type="checkbox"
              className="h-6 w-6 shrink-0 accent-ink"
              checked={ticked[index]}
              onChange={(event) => setTicked(ticked.map((value, at) => (at === index ? event.target.checked : value)))}
            />
            {text}
          </label>
        ))}
      </fieldset>
      <div className="mt-4 flex justify-end">
        <Button variant="primary" disabled={!active || !ready} onClick={() => onAnswer({ confirmed: true })}>
          Check in
        </Button>
      </div>
    </section>
  );
}

export function Refund({ props, active, onAnswer }: ViewProps<"refund">) {
  const { quote, card, booking } = props;
  return (
    <section className="doc p-5" aria-label="Refund">
      <h3 className="mb-1 text-[15px] font-bold">
        Cancel {booking.flight.number} to {booking.flight.toCity}, {shortDay(booking.flight.date)}
      </h3>
      <Lines lines={quote.lines} total={quote.total} totalLabel="Back to you" />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
        <span className="text-[13px] text-ink-2">
          To {card.brand} ending {card.last4}. This cannot be undone.
        </span>
        <Button variant="danger" disabled={!active} onClick={() => onAnswer({ confirmed: true })}>
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
    <div className="flex h-11 min-w-0 flex-1 items-stretch gap-[2px] overflow-hidden" aria-hidden="true">
      {bars.map((width, index) => (
        <span key={index} className={`shrink-0 ${index % 2 === 0 ? "bg-ink" : "bg-transparent"}`} style={{ width: `${width * 1.5}px` }} />
      ))}
    </div>
  );
}

/** The pass: the flight and its facts above the tear-off, the barcode and booking code on the stub below it. */
export function BoardingPass({ props }: ViewProps<"boarding-pass">) {
  const { booking, status } = props;
  const { flight } = booking;
  const boards = status.steps.find((step) => step.key === "boarding");
  const row = Number.parseInt(booking.seat ?? "0", 10);
  const facts = [
    ["Date", shortDay(flight.date)],
    ["Boards", boards?.time ?? "-"],
    // Gates are announced three hours before. Until then a pass says "to be announced".
    ["Gate", status.gate ?? "TBA"],
    ["Seat", booking.seat ?? "-"],
    ["Zone", row <= 8 ? "A" : row <= 16 ? "B" : "C"],
  ];

  return (
    <section className="doc" aria-label="Boarding pass">
      <div className="px-5 pb-5 pt-4">
        <div className="flex items-baseline justify-between gap-3 text-[14px]">
          <span className="text-ink-2">
            <span className="font-bold text-ink">{AIRLINE.name}</span> boarding pass
          </span>
          <span className="flex items-center gap-1.5 font-bold">
            <Check size={15} strokeWidth={2.75} aria-hidden="true" />
            Checked in
          </span>
        </div>
        <div className="mt-3 text-[17px] font-bold">{booking.passenger}</div>
        <div className="mt-3">
          <FlightLine flight={flight} />
        </div>
        <dl className="mt-5 grid grid-cols-3 gap-x-4 gap-y-4 sm:grid-cols-5">
          {facts.map(([label, value]) => (
            <Field key={label} label={label} value={value} />
          ))}
        </dl>
      </div>
      <Perforation />
      <div className="flex items-end justify-between gap-4 px-5 py-4">
        <Barcode seed={booking.code} />
        <dl className="w-32 shrink-0">
          <Field label="Booking" value={booking.code} mono />
        </dl>
      </div>
    </section>
  );
}

const PHASES = { scheduled: "Scheduled", "check-in": "Check-in open", closing: "Bag drop closed", boarding: "Boarding", departed: "In the air", landed: "Landed" } as const;

export function StatusTimeline({ props }: ViewProps<"status-timeline">) {
  const { flight, status } = props;
  const late = status.delayMinutes > 0;
  return (
    <section className="doc p-5" aria-label={`Status of ${flight.number}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div>
          <div className={`flex items-center gap-2 text-[24px] font-bold leading-tight ${late ? "text-warn" : ""}`}>
            {late ? <CircleAlert size={22} aria-hidden="true" /> : null}
            {late ? `${status.delayMinutes} minutes late` : "On time"}
          </div>
          <div className="mt-1 text-[13px] text-ink-3">
            {flight.number}, {flight.fromCity} to {flight.toCity}, {shortDay(flight.date)}
          </div>
        </div>
        <span className="text-[14px] font-bold">
          <span className="stroke">{PHASES[status.phase]}</span>
        </span>
      </div>

      <ol className="mt-5 flex flex-col">
        {status.steps.map((step, index) => (
          <li key={step.key} className="flex gap-3.5">
            <span className="flex flex-col items-center" aria-hidden="true">
              <span
                className={`mt-1 h-3.5 w-3.5 rounded-full border-2 ${
                  step.state === "done" ? "border-ink bg-ink" : step.state === "next" ? "border-mark-edge bg-mark" : "border-edge bg-paper"
                }`}
              />
              {index < status.steps.length - 1 ? <span className={`w-0.5 flex-1 ${step.state === "done" ? "bg-ink" : "bg-edge"}`} /> : null}
            </span>
            <span className={`flex flex-1 flex-wrap items-baseline justify-between gap-x-4 pb-4 text-[15px] ${step.state === "later" ? "text-ink-2" : ""}`}>
              <span className={step.state === "next" ? "font-bold" : ""}>
                {step.label}
                <span className="sr-only">{step.state === "done" ? " (done)" : step.state === "next" ? " (next)" : ""}</span>
              </span>
              <span className="shrink-0 text-ink-2">
                {shortDay(step.date)}, <span className="text-[17px] font-bold text-ink">{step.time}</span>
              </span>
            </span>
          </li>
        ))}
      </ol>

      <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-rule pt-3 text-[13px] text-ink-2">
        <span>{status.terminal}</span>
        <span>{status.gate ? `Gate ${status.gate}` : "Gate shown 3 hours before"}</span>
        {status.walkMinutes ? <span>{status.walkMinutes} minute walk from security</span> : null}
      </div>
    </section>
  );
}
