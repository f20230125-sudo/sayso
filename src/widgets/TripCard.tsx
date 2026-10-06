import { Plane } from "lucide-react";
import { duration, shortDay } from "@/airline/dates";
import type { Booking, Flight } from "@/airline/schema";

// One trip, drawn the way a ticket is read: where from, where to, when.
// Used wherever a booking is shown: the list of trips, the receipt, the
// welcome page.

function Place({ code, city, time, plus, align }: { code: string; city: string; time: string; plus?: number; align: "left" | "right" }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className="text-[26px] font-semibold leading-none tracking-tight">{code}</div>
      <div className="tabular mt-2 text-[13px] text-muted">
        {city} · {time}
        {plus ? <span className="ml-1 text-faint">+{plus} day</span> : null}
      </div>
    </div>
  );
}

/** The route line of a flight: DXB, a line with the flying time, LHR. */
export function FlightLine({ flight }: { flight: Flight }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <Place code={flight.from} city={flight.fromCity} time={flight.departs} align="left" />
      <div className="flex min-w-0 flex-1 items-center gap-2 pt-2.5 text-faint" aria-hidden="true">
        <span className="h-px flex-1 bg-line-strong" />
        <Plane size={14} className="shrink-0 rotate-45" />
        <span className="tabular shrink-0 text-xs">{duration(flight.minutes)}</span>
        <span className="h-px flex-1 bg-line-strong" />
      </div>
      <Place code={flight.to} city={flight.toCity} time={flight.arrives} plus={flight.arrivesDayOffset} align="right" />
    </div>
  );
}

export function tripFacts(booking: Booking): string[] {
  if (booking.status === "cancelled") return ["Cancelled"];
  return [
    booking.seat ? `Seat ${booking.seat}` : "No seat chosen",
    booking.bags === 0 ? "No checked bags" : `${booking.bags} checked ${booking.bags === 1 ? "bag" : "bags"}`,
    booking.checkedIn ? "Checked in" : "Not checked in",
  ];
}

export function TripCard({ booking, bare = false }: { booking: Booking; bare?: boolean }) {
  const { flight } = booking;
  return (
    <article className={bare ? "" : "panel p-5"} aria-label={`${flight.fromCity} to ${flight.toCity}, ${shortDay(flight.date)}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="eyebrow">
          {shortDay(flight.date)} · {flight.number}
        </span>
        <span className="eyebrow" title="Booking reference">
          {booking.code}
        </span>
      </div>
      <div className="mt-4">
        <FlightLine flight={flight} />
      </div>
      <ul className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-line pt-3 text-[13px] text-muted">
        {tripFacts(booking).map((fact) => (
          <li key={fact}>{fact}</li>
        ))}
      </ul>
    </article>
  );
}
