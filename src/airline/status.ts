import { clock, type IsoDate } from "./dates";
import { arrivalMoment, departureMoment } from "./flights";
import { airport } from "./places";
import { between, seeded } from "./random";
import type { Flight, FlightStatus } from "./schema";

// Where a flight stands at a given moment: on time or late, which gate, and
// the steps between now and landing.
//
// The server has no clock of its own here. The moment is part of the question
// ("the status at 10:30 on the 6th"), which keeps the answer the same every
// time it is asked and lets a test ask about any moment it likes.

const MINUTE = 60_000;

/** Check-in opens this long before departure. */
export const CHECK_IN_OPENS_MIN = 48 * 60;
const BAG_DROP_CLOSES_MIN = 60;
const BOARDING_STARTS_MIN = 40;
/** The gate is announced this long before departure. */
const GATE_SHOWN_MIN = 180;

/** A moment as the clock and calendar read at an airport. */
export function localAt(moment: Date, code: string): { date: IsoDate; time: string } {
  const shifted = new Date(moment.getTime() + (airport(code)?.utc ?? 0) * 60 * MINUTE);
  return { date: shifted.toISOString().slice(0, 10), time: clock(shifted.getUTCHours() * 60 + shifted.getUTCMinutes()) };
}

/** About one flight in four runs late, by the same amount every time it is asked. */
function delayOf(flight: Flight): number {
  const next = seeded(`delay:${flight.id}`);
  return next() < 0.25 ? between(next, 3, 15) * 5 : 0;
}

export function checkInOpens(flight: Flight): Date {
  return new Date(departureMoment(flight).getTime() - CHECK_IN_OPENS_MIN * MINUTE);
}

export function isCheckInOpen(flight: Flight, at: Date): boolean {
  return at >= checkInOpens(flight) && at.getTime() < departureMoment(flight).getTime() - BAG_DROP_CLOSES_MIN * MINUTE;
}

export function statusOf(flight: Flight, at: Date): FlightStatus {
  const delay = delayOf(flight);
  const next = seeded(`gate:${flight.id}`);
  const gate = `${"ABCD"[between(next, 0, 3)]}${between(next, 1, 28)}`;
  const walkMinutes = between(next, 3, 14);

  const scheduled = departureMoment(flight).getTime();
  const departs = scheduled + delay * MINUTE;
  const lands = arrivalMoment(flight).getTime() + delay * MINUTE;
  const now = at.getTime();

  const moments = [
    { key: "check-in", label: "Check-in opens", at: scheduled - CHECK_IN_OPENS_MIN * MINUTE, where: flight.from },
    { key: "bag-drop", label: "Bag drop closes", at: departs - BAG_DROP_CLOSES_MIN * MINUTE, where: flight.from },
    { key: "boarding", label: "Boarding starts", at: departs - BOARDING_STARTS_MIN * MINUTE, where: flight.from },
    { key: "departure", label: `Leaves ${flight.fromCity}`, at: departs, where: flight.from },
    { key: "arrival", label: `Lands in ${flight.toCity}`, at: lands, where: flight.to },
  ] as const;

  // How many of the moments have come decides the phase.
  const reached = moments.filter((moment) => moment.at <= now).length;
  const phase = (["scheduled", "check-in", "closing", "boarding", "departed", "landed"] as const)[reached];
  const late = delay > 0 ? `${delay} minutes late` : "on time";
  const headline = {
    scheduled: `scheduled, ${late}`,
    "check-in": `${late}, and check-in is open`,
    closing: `${late}. Bag drop has closed and boarding starts soon`,
    boarding: delay > 0 ? `boarding now, ${late}` : "boarding now",
    departed: delay > 0 ? `in the air, ${late}` : "in the air, on time",
    landed: delay > 0 ? `landed, ${late}` : "landed on time",
  }[phase];

  const gateShown = now >= scheduled - GATE_SHOWN_MIN * MINUTE;
  return {
    flightId: flight.id,
    phase,
    headline,
    delayMinutes: delay,
    terminal: "Terminal 3",
    gate: gateShown ? gate : null,
    walkMinutes: gateShown ? walkMinutes : null,
    steps: moments.map((moment, index) => ({
      key: moment.key,
      label: moment.label,
      ...localAt(new Date(moment.at), moment.where),
      state: index < reached ? "done" : index === reached ? "next" : "later",
    })),
  };
}
