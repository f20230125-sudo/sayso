import { addDays, nextWeekday, type IsoDate } from "./dates";
import { flightsOn } from "./flights";
import { HOME, cityOf } from "./places";
import { FEES } from "./pricing";
import { seeded } from "./random";
import type { Account, Booking, Flight, Payment } from "./schema";
import { findSeat, seatMapOf } from "./seats";

// The traveller the demo is signed in as, and the trips they start with.
//
// The trips are dated from the day of the visit, so there is always a flight
// tomorrow to check in for and a flight a few days out to move. The account
// lives in the visitor's browser: the server never holds it.

const TRAVELLER = { name: "Noor Haddad", tier: "Silver", card: { brand: "Visa", last4: "4242" } } as const;

const THURSDAY = 4;
const SATURDAY = 6;

function flightAt(from: string, to: string, date: IsoDate, slot: number): Flight {
  const flights = flightsOn(from, to, date);
  return flights[Math.min(slot, flights.length - 1)];
}

function seatCost(flight: Flight, seat: string | null): number {
  return seat ? (findSeat(seatMapOf(flight.id), seat)?.price ?? 0) : 0;
}

function booked(code: string, flight: Flight, seat: string | null, bags: number): Booking {
  return {
    code,
    passenger: TRAVELLER.name,
    flight,
    seat,
    bags,
    checkedIn: false,
    status: "confirmed",
    paid: flight.price + seatCost(flight, seat) + bags * FEES.bag,
  };
}

/** Earlier trips, already flown. They only matter for questions about spending. */
function pastPayments(today: IsoDate): Payment[] {
  const next = seeded("past-trips");
  const places = ["CAI", "LHR", "DEL", "IST", "SIN", "BOM", "LHR"];
  return places.map((place, index) => {
    const date = addDays(today, -(20 + index * 34 + Math.floor(next() * 12)));
    const flight = flightAt(HOME, place, date, index);
    const amount = flight.price + (index % 2 === 0 ? FEES.bag : 0);
    return {
      id: `P-${1000 + index}`,
      date,
      amount,
      what: `Flight ${flight.number}`,
      route: `Dubai to ${cityOf(place)}`,
      bookingCode: `PAST${index + 1}`,
    };
  });
}

export function demoAccount(today: IsoDate): Account {
  // Tomorrow: close enough to check in for.
  const mumbai = booked("T5LW4H", flightAt(HOME, "BOM", addDays(today, 1), 1), "9C", 1);
  // The coming Thursday, but never sooner than the day after tomorrow, so it
  // is always a different flight from the one above. A middle seat on purpose:
  // asking for a window is then a real change.
  const london = booked("K7QM2P", flightAt(HOME, "LHR", nextWeekday(addDays(today, 2), THURSDAY), 1), "17E", 1);
  // A Saturday a couple of weeks out, with no seat and no bag chosen yet.
  const istanbul = booked("R3XD8N", flightAt(HOME, "IST", nextWeekday(addDays(today, 16), SATURDAY), 0), null, 0);

  const bookings = [mumbai, london, istanbul];
  const payments: Payment[] = [
    ...bookings.map((booking, index) => ({
      id: `P-${2000 + index}`,
      date: addDays(today, -(6 + index * 9)),
      amount: booking.paid,
      what: `Flight ${booking.flight.number}`,
      route: `${booking.flight.fromCity} to ${booking.flight.toCity}`,
      bookingCode: booking.code,
    })),
    ...pastPayments(today),
  ].sort((a, b) => (a.date < b.date ? 1 : -1));

  return { traveller: { ...TRAVELLER, card: { ...TRAVELLER.card } }, bookings, payments, seededOn: today };
}

/** Confirmed bookings that have not left yet, soonest first. */
export function upcoming(account: Account, today: IsoDate): Booking[] {
  return account.bookings
    .filter((booking) => booking.status === "confirmed" && booking.flight.date >= today)
    .sort((a, b) => (a.flight.date + a.flight.departs < b.flight.date + b.flight.departs ? -1 : 1));
}
