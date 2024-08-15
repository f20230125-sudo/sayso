import { describe, expect, it } from "vitest";
import { demoAccount, upcoming } from "./account";
import { addDays, daysBetween, isIsoDate, localDay, longDay, mondayOf, nextWeekday, shortDay, weekdayOf } from "./dates";
import { arrivalMoment, cheapestByDay, departureMoment, findFlight, flightsOn } from "./flights";
import { destinationOf, placesIn } from "./places";
import { FEES, placeOrder, quoteFor } from "./pricing";
import { code, hash, seeded } from "./random";
import { accountSchema, flightSchema, seatMapSchema, type Booking } from "./schema";
import { describeSeat, findSeat, seatKinds, seatMapOf, seatPhrase, seatPrice } from "./seats";

const TODAY = "2026-10-06"; // a Tuesday

describe("dates", () => {
  it("knows a real date from a made-up one", () => {
    expect(isIsoDate("2026-10-15")).toBe(true);
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("15 Oct")).toBe(false);
  });

  it("adds days across a month and a year", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(daysBetween("2026-10-06", "2026-10-15")).toBe(9);
  });

  it("finds weekdays", () => {
    expect(weekdayOf(TODAY)).toBe(2);
    expect(nextWeekday(TODAY, 4)).toBe("2026-10-08");
    expect(nextWeekday(TODAY, 2)).toBe(TODAY);
    expect(mondayOf(TODAY)).toBe("2026-10-05");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05"); // a Sunday belongs to the week before it
  });

  it("writes days for people", () => {
    expect(shortDay("2026-10-15")).toBe("Thu 15 Oct");
    expect(longDay("2026-10-15")).toBe("Thursday 15 October");
  });

  it("takes the visitor's own day from a moment", () => {
    expect(localDay(new Date(2026, 9, 6, 23, 59))).toBe("2026-10-06");
  });
});

describe("random", () => {
  it("gives the same numbers for the same seed", () => {
    const a = seeded("x");
    const b = seeded("x");
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
    expect(seeded("y")()).not.toBe(seeded("x")());
    expect(hash("abc")).toBe(hash("abc"));
  });

  it("writes codes without letters people misread", () => {
    expect(code(seeded("k"), 200)).toMatch(/^[A-HJ-NP-Z2-9]{200}$/);
  });
});

describe("places", () => {
  it("only knows routes that touch Dubai", () => {
    expect(destinationOf("DXB", "LHR")?.city).toBe("London");
    expect(destinationOf("lhr", "dxb")?.city).toBe("London");
    expect(destinationOf("LHR", "CDG")).toBeNull();
    expect(destinationOf("DXB", "DXB")).toBeNull();
    expect(destinationOf("DXB", "XXX")).toBeNull();
  });

  it("finds places in a sentence", () => {
    expect(placesIn("my London flight").map((place) => place.code)).toEqual(["LHR"]);
    expect(placesIn("from Dubai to New York City please").map((place) => place.code)).toEqual(["DXB", "JFK"]);
    expect(placesIn("bombay or LHR")).toHaveLength(2);
    expect(placesIn("a single seat")).toEqual([]); // "sin" inside a word is not Singapore
  });
});

describe("flights", () => {
  it("gives the same timetable every time", () => {
    const first = flightsOn("DXB", "LHR", "2026-10-15");
    expect(first).toEqual(flightsOn("DXB", "LHR", "2026-10-15"));
    expect(first.length).toBeGreaterThanOrEqual(3);
    for (const flight of first) expect(flightSchema.safeParse(flight).success).toBe(true);
  });

  it("flies the same numbers at the same times every day, at different prices", () => {
    const monday = flightsOn("DXB", "IST", "2026-10-12");
    const friday = flightsOn("DXB", "IST", "2026-10-16");
    expect(monday.map((flight) => [flight.number, flight.departs])).toEqual(friday.map((flight) => [flight.number, flight.departs]));
    expect(monday.map((flight) => flight.price)).not.toEqual(friday.map((flight) => flight.price));
  });

  it("works a flight out again from its id", () => {
    for (const [from, to] of [
      ["DXB", "JFK"],
      ["BOM", "DXB"],
      ["DXB", "NBO"],
    ]) {
      for (const flight of flightsOn(from, to, "2026-11-02")) expect(findFlight(flight.id)).toEqual(flight);
    }
    expect(findFlight("JN999_2026-11-02")).toBeNull();
    expect(findFlight("XX201_2026-11-02")).toBeNull();
    expect(findFlight("JN201_2026-13-02")).toBeNull();
    expect(findFlight("nonsense")).toBeNull();
  });

  it("has nothing for a route it does not fly", () => {
    expect(flightsOn("LHR", "CDG", "2026-10-15")).toEqual([]);
    expect(flightsOn("DXB", "LHR", "soon")).toEqual([]);
  });

  it("lands when the flying time says, in the local time there", () => {
    for (const flight of flightsOn("DXB", "JFK", "2026-10-15")) {
      expect(arrivalMoment(flight).getTime() - departureMoment(flight).getTime()).toBe(flight.minutes * 60_000);
      expect(flight.arrivesDayOffset).toBeGreaterThanOrEqual(0);
    }
  });

  it("lists the cheapest fare per day", () => {
    const days = cheapestByDay("DXB", "LHR", "2026-10-12", 7);
    expect(days.map((day) => day.date)).toEqual(Array.from({ length: 7 }, (_unused, index) => addDays("2026-10-12", index)));
    for (const day of days) expect(day.price).toBe(Math.min(...flightsOn("DXB", "LHR", day.date).map((flight) => flight.price)));
  });
});

describe("seats", () => {
  it("names the kinds of seat", () => {
    expect(seatKinds(14, "A")).toEqual(["window"]);
    expect(seatKinds(14, "C")).toEqual(["aisle"]);
    expect(seatKinds(14, "E")).toEqual(["middle"]);
    expect(seatKinds(10, "F")).toEqual(["window", "legroom"]);
    expect(seatKinds(2, "D")).toEqual(["aisle", "front"]);
    expect(describeSeat(["window", "legroom"])).toBe("window with extra legroom");
    expect(describeSeat(["aisle"])).toBe("aisle");
    expect(seatPhrase(["aisle"])).toBe("an aisle seat");
    expect(seatPhrase(["window", "legroom"])).toBe("a window seat with extra legroom");
    expect(seatPhrase(["middle", "front"])).toBe("a middle seat at the front");
  });

  it("prices by the best thing about the seat", () => {
    expect(seatPrice(["middle"])).toBe(0);
    expect(seatPrice(["window"])).toBe(35);
    expect(seatPrice(["middle", "front"])).toBe(90);
    expect(seatPrice(["aisle", "legroom"])).toBe(160);
  });

  it("builds the same cabin every time, with something free of every kind", () => {
    const map = seatMapOf("JN201_2026-10-15");
    expect(map).toEqual(seatMapOf("JN201_2026-10-15"));
    expect(seatMapSchema.safeParse(map).success).toBe(true);
    expect(map.rows).toHaveLength(24);
    const seats = map.rows.flatMap((row) => row.seats);
    for (const kind of ["window", "aisle", "legroom", "front"] as const) {
      expect(seats.some((seat) => seat.kinds.includes(kind) && !seat.taken)).toBe(true);
    }
    expect(seats.some((seat) => seat.taken)).toBe(true);
    expect(findSeat(map, "14a")?.id).toBe("14A");
    expect(findSeat(map, "99Z")).toBeNull();
  });
});

describe("the demo account", () => {
  it("is valid, and dated from the day of the visit", () => {
    for (let offset = 0; offset < 14; offset += 1) {
      const today = addDays(TODAY, offset);
      const account = demoAccount(today);
      expect(accountSchema.safeParse(account).success).toBe(true);
      const trips = upcoming(account, today);
      expect(trips.map((trip) => trip.flight.to)).toEqual(["BOM", "LHR", "IST"]);
      expect(trips[0].flight.date).toBe(addDays(today, 1));
      expect(weekdayOf(trips[1].flight.date)).toBe(4);
      expect(daysBetween(today, trips[1].flight.date)).toBeGreaterThanOrEqual(2);
      expect(weekdayOf(trips[2].flight.date)).toBe(6);
    }
  });

  it("leaves cancelled and past trips out of what is upcoming", () => {
    const account = demoAccount(TODAY);
    account.bookings[0].status = "cancelled";
    expect(upcoming(account, TODAY)).toHaveLength(2);
    expect(upcoming(account, addDays(TODAY, 400))).toHaveLength(0);
  });
});

describe("pricing", () => {
  const account = demoAccount(TODAY);
  const london = account.bookings.find((booking) => booking.flight.to === "LHR") as Booking;
  const seatsOf = (flightId: string) => seatMapOf(flightId).rows.flatMap((row) => row.seats);
  const freeSeat = (kind: "window" | "aisle" | "middle") =>
    seatsOf(london.flight.id).find((seat) => !seat.taken && seat.kinds.length === 1 && seat.kinds[0] === kind && seat.id !== london.seat)!;

  it("prices a seat and puts it on the booking", () => {
    const seat = freeSeat("window");
    const priced = quoteFor(london, [{ type: "seat", seat: seat.id }]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote).toEqual({ lines: [{ label: `Seat ${seat.id}, window`, amount: 35 }], total: 35, currency: "AED" });
    expect(priced.after.seat).toBe(seat.id);
    expect(priced.after.paid).toBe(london.paid + 35);
  });

  it("refuses a seat that is taken, missing, or already yours", () => {
    const taken = seatsOf(london.flight.id).find((seat) => seat.taken && seat.id !== london.seat)!;
    expect(quoteFor(london, [{ type: "seat", seat: taken.id }])).toMatchObject({ ok: false, code: "seat_taken", status: 409 });
    expect(quoteFor(london, [{ type: "seat", seat: "40A" }])).toMatchObject({ ok: false, code: "no_such_seat" });
    expect(quoteFor(london, [{ type: "seat", seat: london.seat! }])).toMatchObject({ ok: false, code: "same_seat" });
  });

  it("prices extra bags by how many are added", () => {
    const priced = quoteFor(london, [{ type: "bags", count: london.bags + 2 }]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote.total).toBe(2 * FEES.bag);
    expect(priced.after.bags).toBe(london.bags + 2);
    expect(quoteFor(london, [{ type: "bags", count: london.bags }])).toMatchObject({ ok: false, code: "same_bags" });
  });

  it("moves a booking to another flight on the same route, and drops the old seat", () => {
    const other = flightsOn("DXB", "LHR", addDays(london.flight.date, 5))[0];
    const priced = quoteFor(london, [{ type: "move", toFlightId: other.id }]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote.total).toBe(other.price - london.flight.price + FEES.change);
    expect(priced.after.flight).toEqual(other);
    expect(priced.after.seat).toBeNull();
    expect(quoteFor(london, [{ type: "move", toFlightId: london.flight.id }])).toMatchObject({ ok: false, code: "same_flight" });
    const istanbul = flightsOn("DXB", "IST", london.flight.date)[0];
    expect(quoteFor(london, [{ type: "move", toFlightId: istanbul.id }])).toMatchObject({ ok: false, code: "different_route" });
  });

  it("prices several changes as one order, with the seat on the new flight", () => {
    const other = flightsOn("DXB", "LHR", addDays(london.flight.date, 5))[0];
    const seat = seatsOf(other.id).find((entry) => !entry.taken && entry.price === 35)!;
    // Given out of order on purpose: the move still comes first.
    const priced = quoteFor(london, [
      { type: "bags", count: london.bags + 1 },
      { type: "seat", seat: seat.id },
      { type: "move", toFlightId: other.id },
    ]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote.lines).toHaveLength(4);
    expect(priced.quote.total).toBe(other.price - london.flight.price + FEES.change + 35 + FEES.bag);
    expect(priced.after).toMatchObject({ seat: seat.id, bags: london.bags + 1, flight: { id: other.id } });
  });

  it("refunds a cancelled booking, less the fee", () => {
    const priced = quoteFor(london, [{ type: "cancel" }]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote.total).toBe(-(london.paid - FEES.cancel));
    expect(priced.after.status).toBe("cancelled");
    expect(priced.after.paid).toBe(FEES.cancel);
    expect(quoteFor(priced.after, [{ type: "bags", count: 3 }])).toMatchObject({ ok: false, code: "cancelled" });
    expect(quoteFor(london, [{ type: "cancel" }, { type: "bags", count: 3 }])).toMatchObject({ ok: false, code: "bad_order" });
  });

  it("books a new flight", () => {
    const flight = flightsOn("DXB", "SIN", "2026-11-20")[0];
    const priced = quoteFor(null, [{ type: "book", flightId: flight.id, passenger: "Uzair Khan" }]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote.total).toBe(flight.price);
    expect(priced.after).toMatchObject({ passenger: "Uzair Khan", seat: null, bags: 0, paid: flight.price });
    expect(quoteFor(london, [{ type: "book", flightId: flight.id, passenger: "x" }])).toMatchObject({ ok: false, code: "bad_order" });
    expect(quoteFor(null, [{ type: "seat", seat: "1A" }])).toMatchObject({ ok: false, code: "bad_order" });
  });

  it("checks in only with a seat, and only once", () => {
    const priced = quoteFor(london, [{ type: "check-in" }]);
    if (!priced.ok) throw new Error(priced.message);
    expect(priced.quote.total).toBe(0);
    expect(priced.after.checkedIn).toBe(true);
    expect(quoteFor(priced.after, [{ type: "check-in" }])).toMatchObject({ ok: false, code: "checked_in" });
    expect(quoteFor({ ...london, seat: null }, [{ type: "check-in" }])).toMatchObject({ ok: false, code: "no_seat" });
  });

  it("refuses two changes of the same kind", () => {
    expect(
      quoteFor(london, [
        { type: "bags", count: 2 },
        { type: "bags", count: 3 },
      ]),
    ).toMatchObject({ ok: false, code: "duplicate_change" });
  });

  it("places an order only at the price it works out itself", () => {
    const seat = freeSeat("aisle");
    const at = new Date("2026-10-06T10:00:00Z");
    expect(placeOrder(london, [{ type: "seat", seat: seat.id }], 1, at)).toMatchObject({ ok: false, code: "price_changed", status: 409 });

    const placed = placeOrder(london, [{ type: "seat", seat: seat.id }], 35, at);
    if (!placed.ok) throw new Error(placed.message);
    expect(placed.result.booking).toMatchObject({ code: london.code, seat: seat.id });
    expect(placed.result.receipt).toMatchObject({ bookingCode: london.code, total: 35, at: at.toISOString() });
    expect(placed.result.receipt.id).toMatch(/^R-[A-Z2-9]{6}$/);
  });

  it("gives a new booking a reference", () => {
    const flight = flightsOn("DXB", "CAI", "2026-11-20")[0];
    const placed = placeOrder(null, [{ type: "book", flightId: flight.id, passenger: "Uzair Khan" }], flight.price, new Date("2026-10-06T10:00:00Z"));
    if (!placed.ok) throw new Error(placed.message);
    expect(placed.result.booking.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(placed.result.receipt.bookingCode).toBe(placed.result.booking.code);
  });
});
