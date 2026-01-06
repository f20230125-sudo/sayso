import { addDays, clock, isIsoDate, minutesOf, weekdayOf, type IsoDate } from "./dates";
import { AIRLINE, DESTINATIONS, HOME, airport, cityOf, destinationOf } from "./places";
import { between, seeded } from "./random";
import type { Flight } from "./schema";

// The timetable. Nothing is stored: a route's daily departures are worked out
// from the route, and each day's prices and free seats from the route and the
// day. Ask twice and the answer is the same.

/** Departure times a route may use, as minutes after midnight. */
const SLOTS = [395, 500, 615, 755, 890, 1010, 1135, 1290, 1375];

const WEEKDAY_FACTOR = [1.16, 0.98, 0.92, 0.92, 1, 1.18, 1.06]; // Sunday first

type Departure = { number: string; departs: number };

/** The same departures every day: this is what makes "JN 204" mean something. */
function departuresOf(from: string, to: string): Departure[] {
  const place = destinationOf(from, to);
  if (!place) return [];
  const outbound = from.toUpperCase() === HOME;
  const index = DESTINATIONS.findIndex((other) => other.code === place.code);
  const next = seeded(`timetable:${place.code}:${outbound ? "out" : "back"}`);

  const count = between(next, 3, 5);
  const slots = [...SLOTS];
  const chosen: number[] = [];
  for (let taken = 0; taken < count; taken += 1) chosen.push(slots.splice(Math.floor(next() * slots.length), 1)[0]);
  chosen.sort((a, b) => a - b);

  // Odd numbers fly out of Dubai, even numbers fly back.
  return chosen.map((departs, slot) => ({
    number: `${AIRLINE.code} ${201 + index * 20 + slot * 2 + (outbound ? 0 : 1)}`,
    departs: departs + between(next, 0, 2) * 5,
  }));
}

export function flightId(number: string, date: IsoDate): string {
  return `${number.replace(/\s+/g, "")}_${date}`;
}

/** Every flight between two airports on one day, earliest first. */
export function flightsOn(from: string, to: string, date: IsoDate): Flight[] {
  const origin = airport(from);
  const arrival = airport(to);
  const place = destinationOf(from, to);
  if (!origin || !arrival || !place || !isIsoDate(date)) return [];

  return departuresOf(from, to).map(({ number, departs }) => {
    const next = seeded(`day:${number}:${date}`);
    const landsAt = departs - origin.utc * 60 + place.minutes + arrival.utc * 60;
    const early = departs < 420 || departs > 1260 ? 0.93 : 1;
    const price = Math.round((place.fare * WEEKDAY_FACTOR[weekdayOf(date)] * early * (0.9 + next() * 0.24)) / 5) * 5;

    return {
      id: flightId(number, date),
      number,
      from: origin.code,
      to: arrival.code,
      fromCity: origin.city,
      toCity: arrival.city,
      date,
      departs: clock(departs),
      arrives: clock(landsAt),
      arrivesDayOffset: Math.floor(landsAt / 1440),
      minutes: place.minutes,
      price,
      seatsLeft: between(next, 2, 38),
    };
  });
}

/** Work a flight out again from its id. Null when the id names no flight. */
export function findFlight(id: string): Flight | null {
  const match = /^([A-Z]{2})(\d{3})_(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!match || match[1] !== AIRLINE.code || !isIsoDate(match[3])) return null;
  const number = Number(match[2]);
  const place = DESTINATIONS[Math.floor((number - 201) / 20)];
  if (!place) return null;
  const outbound = (number - 201) % 2 === 0;
  const [from, to] = outbound ? [HOME, place.code] : [place.code, HOME];
  return flightsOn(from, to, match[3]).find((flight) => flight.id === id) ?? null;
}

export type CalendarDay = { date: IsoDate; price: number; flights: number };

/** The cheapest fare on each of a run of days, for choosing a day at a glance. */
export function cheapestByDay(from: string, to: string, start: IsoDate, days: number): CalendarDay[] {
  const calendar: CalendarDay[] = [];
  for (let offset = 0; offset < days; offset += 1) {
    const date = addDays(start, offset);
    const flights = flightsOn(from, to, date);
    if (flights.length > 0) calendar.push({ date, price: Math.min(...flights.map((flight) => flight.price)), flights: flights.length });
  }
  return calendar;
}

/** The moment a flight leaves, as a real point in time. */
export function departureMoment(flight: Flight): Date {
  const utc = airport(flight.from)?.utc ?? 0;
  return new Date(Date.parse(`${flight.date}T00:00:00Z`) + (minutesOf(flight.departs) - utc * 60) * 60_000);
}

export function arrivalMoment(flight: Flight): Date {
  return new Date(departureMoment(flight).getTime() + flight.minutes * 60_000);
}

/** "Dubai to London" */
export function routeName(flight: Pick<Flight, "from" | "to">): string {
  return `${cityOf(flight.from)} to ${cityOf(flight.to)}`;
}
