import { Plane } from "lucide-react";
import { Field, Perforation } from "@/components/ui";
import { duration, shortDay } from "@/airline/dates";
import { AIRLINE } from "@/airline/places";
import type { Booking, Flight } from "@/airline/schema";

// One trip, drawn as the pass it is: where from, where to, when, with a
// tear-off below for the facts about the booking. Used wherever a booking is
// shown: the list of trips, the receipt, the welcome page (at hero size).

const CODE_SIZE = {
  hero: "text-[48px] leading-[0.95] tracking-[-0.03em] @min-[400px]:text-[60px] @min-[500px]:text-[76px]",
  pass: "text-[34px] leading-none tracking-[-0.03em]",
} as const;

function Place({ code, city, time, plus, align, size }: { code: string; city: string; time: string; plus?: number; align: "left" | "right"; size: keyof typeof CODE_SIZE }) {
  return (
    <div className={align === "right" ? "text-right" : ""}>
      <div className={`font-bold ${CODE_SIZE[size]}`}>{code}</div>
      <div className="mt-2.5 text-[14px] leading-snug text-ink-2 @min-[500px]:mt-3">
        {city}, {time}
        {plus ? <span className="ml-1 text-ink-3">+{plus} day</span> : null}
      </div>
    </div>
  );
}

/** The route line of a flight: DXB, a line with the flying time, LHR. */
export function FlightLine({ flight, size = "pass" }: { flight: Flight; size?: keyof typeof CODE_SIZE }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <Place code={flight.from} city={flight.fromCity} time={flight.departs} align="left" size={size} />
      <div
        className={`flex min-w-0 flex-1 items-center gap-1.5 text-[13px] text-ink-3 sm:gap-2 ${size === "hero" ? "pt-[22px] @min-[400px]:pt-[29px] @min-[500px]:pt-[38px]" : "pt-[15px]"}`}
        aria-hidden="true"
      >
        <span className="h-0 min-w-2 flex-1 border-t-[1.5px] border-ink" />
        {/* On a narrow pass the codes need the room more than the little plane does. */}
        <Plane size={15} className={`shrink-0 rotate-45 ${size === "hero" ? "hidden @min-[400px]:block" : ""}`} />
        <span className="shrink-0">{duration(flight.minutes)}</span>
        <span className="h-0 min-w-2 flex-1 border-t-[1.5px] border-ink" />
      </div>
      <Place code={flight.to} city={flight.toCity} time={flight.arrives} plus={flight.arrivesDayOffset} align="right" size={size} />
    </div>
  );
}

/** The facts under the tear-off line, each as a caption and the value it describes. */
export function tripFacts(booking: Booking): [label: string, value: string][] {
  if (booking.status === "cancelled") return [["Status", "Cancelled"], ["Booking", booking.code]];
  return [
    ["Seat", booking.seat ?? "Not chosen"],
    ["Checked bags", booking.bags === 0 ? "None" : String(booking.bags)],
    ["Checked in", booking.checkedIn ? "Yes" : "Not yet"],
    ["Booking", booking.code],
  ];
}

export function TripCard({ booking, bare = false, hero = false }: { booking: Booking; bare?: boolean; hero?: boolean }) {
  const { flight } = booking;
  const pad = hero ? "px-5 @min-[500px]:px-7" : "px-5";
  return (
    <article className={`${bare ? "" : "doc"} ${hero ? "@container" : ""}`} aria-label={`${flight.fromCity} to ${flight.toCity}, ${shortDay(flight.date)}`}>
      <div className={bare ? "" : `${pad} ${hero ? "pb-4 pt-4 @min-[500px]:pb-6 @min-[500px]:pt-6" : "pb-5 pt-4"}`}>
        <div className="flex items-baseline justify-between gap-3 text-[14px] text-ink-2">
          <span>
            <span className="font-bold text-ink">{AIRLINE.name}</span>
            <span className="ml-2.5">{flight.number}</span>
          </span>
          <span>{shortDay(flight.date)}</span>
        </div>
        <div className={hero ? "mt-2.5 @min-[500px]:mt-4" : "mt-3"}>
          <FlightLine flight={flight} size={hero ? "hero" : "pass"} />
        </div>
      </div>
      {bare ? null : <Perforation />}
      <dl className={`grid grid-cols-2 gap-x-4 gap-y-3 ${hero ? "@min-[440px]:grid-cols-4" : "sm:grid-cols-4"} ${bare ? "mt-4" : `${pad} ${hero ? "pb-4 pt-4 @min-[500px]:pb-5 @min-[500px]:pt-5" : "pb-5 pt-5"}`}`}>
        {tripFacts(booking).map(([label, value]) => (
          <Field key={label} label={label} value={value} />
        ))}
      </dl>
    </article>
  );
}
