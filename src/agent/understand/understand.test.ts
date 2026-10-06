import { describe, expect, it } from "vitest";
import { seatMapOf } from "@/airline/seats";
import { TODAY, account, freeSeat, takenSeat, trip } from "@/test/api";
import type { Context, Json } from "../types";
import { findDates, numberFrom } from "./dates";
import { mergeIntents, understandByRules } from "./rules";

// TODAY is Tuesday 6 October 2026.

const day = (date: string) => ({ from: date, to: date });
const wishes = (text: string) => findDates(text, TODAY).map((found) => found.wish);

describe("finding dates in a sentence", () => {
  it("reads days named from today", () => {
    expect(wishes("today")).toEqual([day("2026-10-06")]);
    expect(wishes("tomorrow")).toEqual([day("2026-10-07")]);
    expect(wishes("the day after tomorrow")).toEqual([day("2026-10-08")]);
    expect(wishes("in three days")).toEqual([day("2026-10-09")]);
    expect(wishes("in a week")).toEqual([day("2026-10-13")]);
  });

  it("reads days of the week as the next one to come, never today", () => {
    expect(wishes("thursday")).toEqual([day("2026-10-08")]);
    expect(wishes("on fri")).toEqual([day("2026-10-09")]);
    expect(wishes("tuesday")).toEqual([day("2026-10-13")]);
    expect(findDates("thursday", TODAY)[0].weekday).toBe(4);
  });

  it('reads "next Thursday" as the Thursday of the week after this one', () => {
    expect(wishes("next thursday")).toEqual([day("2026-10-15")]);
    expect(wishes("next monday")).toEqual([day("2026-10-12")]);
  });

  it("reads ranges", () => {
    expect(wishes("next week")).toEqual([{ from: "2026-10-12", to: "2026-10-18" }]);
    expect(wishes("this week")).toEqual([{ from: "2026-10-06", to: "2026-10-11" }]);
    expect(wishes("the weekend")).toEqual([{ from: "2026-10-10", to: "2026-10-11" }]);
    expect(wishes("next weekend")).toEqual([{ from: "2026-10-17", to: "2026-10-18" }]);
    expect(wishes("next month")).toEqual([{ from: "2026-11-01", to: "2026-11-30" }]);
  });

  it("reads calendar dates, rolling a date that has passed into next year", () => {
    expect(wishes("15 oct")).toEqual([day("2026-10-15")]);
    expect(wishes("15th of october")).toEqual([day("2026-10-15")]);
    expect(wishes("november 2nd")).toEqual([day("2026-11-02")]);
    expect(wishes("oct 3")).toEqual([day("2027-10-03")]);
    expect(wishes("2026-12-24")).toEqual([day("2026-12-24")]);
  });

  it('reads "the 15th" as the next 15th', () => {
    expect(wishes("the 15th")).toEqual([day("2026-10-15")]);
    expect(wishes("the 3rd")).toEqual([day("2026-11-03")]);
    expect(wishes("the 31st")).toEqual([day("2026-10-31")]);
  });

  it("reads shifts from the current date", () => {
    expect(wishes("two days later")).toEqual([{ shiftDays: 2 }]);
    expect(wishes("a week earlier")).toEqual([{ shiftDays: -7 }]);
    expect(wishes("a couple of days later")).toEqual([{ shiftDays: 2 }]);
    expect(wishes("1 day sooner")).toEqual([{ shiftDays: -1 }]);
  });

  it("finds nothing in dates that do not exist, or in no date at all", () => {
    expect(wishes("31 feb")).toEqual([]);
    expect(wishes("2026-13-40")).toEqual([]);
    expect(wishes("a window seat")).toEqual([]);
  });

  it("finds several, in the order they are said, and says where", () => {
    const found = findDates("move my thursday flight to next week", TODAY);
    expect(found.map((entry) => entry.wish)).toEqual([day("2026-10-08"), { from: "2026-10-12", to: "2026-10-18" }]);
    expect("move my thursday flight to next week".slice(found[1].index, found[1].index + found[1].length)).toBe("next week");
  });

  it("reads numbers written as words", () => {
    expect(numberFrom("two")).toBe(2);
    expect(numberFrom("A")).toBe(1);
    expect(numberFrom("12")).toBe(12);
    expect(numberFrom("several")).toBeNull();
  });
});

const context = (active?: Context["active"]): Context => ({ today: TODAY, account: account(), ...(active ? { active } : {}) });
const read = (words: string, active?: Context["active"]) => understandByRules(words, context(active));

describe("understanding by rules", () => {
  it("understands asking to see trips", () => {
    for (const words of ["Show my trips", "what flights do I have?", "my bookings", "Where am I flying"]) {
      expect(read(words), words).toEqual({ kind: "request", intents: [{ journey: "trips" }] });
    }
  });

  it("understands a seat request, with the kind of seat and the trip", () => {
    expect(read("Give me a window seat on my London flight")).toEqual({
      kind: "request",
      intents: [{ journey: "seat", trip: { place: "LHR" }, wish: "window" }],
    });
    expect(read("I want more legroom")).toEqual({ kind: "request", intents: [{ journey: "seat", wish: "legroom" }] });
    expect(read("an aisle seat on my Thursday flight.")).toEqual({
      kind: "request",
      intents: [{ journey: "seat", trip: { weekday: 4 }, wish: "aisle" }],
    });
    expect(read("change my seat")).toEqual({ kind: "request", intents: [{ journey: "seat" }] });
    expect(read("can I sit at the front")).toEqual({ kind: "request", intents: [{ journey: "seat", wish: "front" }] });
  });

  it("reads a seat named outright, and a booking named by its reference", () => {
    expect(read("put me in seat 14a")).toEqual({ kind: "request", intents: [{ journey: "seat", seat: "14A" }] });
    expect(read("window seat for booking k7qm2p")).toEqual({
      kind: "request",
      intents: [{ journey: "seat", trip: { code: "K7QM2P" }, wish: "window" }],
    });
    expect(read("a window seat on my next flight")).toEqual({
      kind: "request",
      intents: [{ journey: "seat", trip: { next: true }, wish: "window" }],
    });
  });

  it("does not read a seat into a number followed by a word", () => {
    expect(read("the 15 a window seat")).toEqual({ kind: "request", intents: [{ journey: "seat", wish: "window" }] });
  });

  it("answers small talk without doing anything", () => {
    expect(read("Hello!")).toEqual({ kind: "chat", about: "hello" });
    expect(read("thanks")).toEqual({ kind: "chat", about: "thanks" });
    expect(read("what can you do?")).toEqual({ kind: "chat", about: "help" });
  });

  it("says so when it does not understand", () => {
    expect(read("sing me a song")).toEqual({ kind: "unknown" });
    expect(read("   ")).toEqual({ kind: "unknown" });
  });

  it("joins the parts of one sentence into one request", () => {
    expect(read("a seat, window, on my London flight")).toEqual({
      kind: "request",
      intents: [{ journey: "seat", wish: "window", trip: { place: "LHR" } }],
    });
  });
});

describe("words said while a component is waiting", () => {
  const london = trip("LHR");
  const seatIntent = [{ journey: "seat" as const, trip: { place: "LHR" }, wish: "window" as const }];
  const atSeatMap = {
    intents: seatIntent,
    widget: "seat-map" as const,
    props: { map: seatMapOf(london.flight.id), flight: london.flight, wish: "window", current: london.seat, preselect: null } as unknown as Json,
  };
  const atPrice = { intents: seatIntent, widget: "price-summary" as const, props: {} as Json };
  const atChooser = { intents: [{ journey: "seat" as const }], widget: "trip-chooser" as const, props: { bookings: account().bookings } as unknown as Json };

  it("takes a typed seat as the answer to the seat map", () => {
    const seat = freeSeat(london, "window");
    expect(read(seat.id.toLowerCase(), atSeatMap)).toEqual({ kind: "answer", answer: { seat: seat.id, kinds: seat.kinds, price: seat.price } });
    expect(read(`seat ${seat.id}`, atSeatMap)).toMatchObject({ kind: "answer" });
  });

  it("says why a typed seat cannot be had", () => {
    expect(read(takenSeat(london).id, atSeatMap)).toEqual({ kind: "cannot", why: `Seat ${takenSeat(london).id} is taken. Pick another.` });
    expect(read("40A", atSeatMap)).toEqual({ kind: "cannot", why: "There is no seat 40A on this flight." });
    expect(read(london.seat!, atSeatMap)).toEqual({ kind: "cannot", why: `${london.seat} is the seat you already have.` });
  });

  it("takes yes as confirming a price, and no as leaving it", () => {
    expect(read("Yes", atPrice)).toEqual({ kind: "answer", answer: { confirmed: true } });
    expect(read("go ahead", atPrice)).toEqual({ kind: "answer", answer: { confirmed: true } });
    expect(read("no", atPrice)).toEqual({ kind: "abandon" });
    expect(read("never mind", atSeatMap)).toEqual({ kind: "abandon" });
    expect(read("cancel that", atSeatMap)).toEqual({ kind: "abandon" });
  });

  it("does not take yes as an answer to anything else", () => {
    expect(read("yes", atSeatMap)).toEqual({ kind: "unknown" });
    expect(read("yes")).toEqual({ kind: "unknown" });
  });

  it("takes a trip named in words as the answer to which trip", () => {
    expect(read("the London one", atChooser)).toEqual({ kind: "answer", answer: { booking: london } });
    expect(read("thursday", atChooser)).toEqual({ kind: "answer", answer: { booking: london } });
    expect(read("tomorrow", atChooser)).toEqual({ kind: "answer", answer: { booking: trip("BOM") } });
    expect(read("the Paris one", atChooser)).toEqual({ kind: "unknown" });
  });

  it("treats another paid request as a change to the journey, not a new one", () => {
    expect(read("aisle instead", atSeatMap)).toEqual({ kind: "amend", intents: [{ journey: "seat", wish: "aisle" }] });
    expect(read("aisle instead")).toEqual({ kind: "request", intents: [{ journey: "seat", wish: "aisle" }] });
  });

  it("treats a request for something else as a new request", () => {
    expect(read("show my trips", atSeatMap)).toEqual({ kind: "request", intents: [{ journey: "trips" }] });
  });
});

describe("merging intents", () => {
  it("lets later details win, and keeps the rest", () => {
    expect(mergeIntents([{ journey: "seat", trip: { place: "LHR" }, wish: "window" }], [{ journey: "seat", wish: "aisle" }])).toEqual([
      { journey: "seat", trip: { place: "LHR" }, wish: "aisle" },
    ]);
  });

  it("adds a journey that was not there", () => {
    expect(mergeIntents([{ journey: "trips" }], [{ journey: "seat", wish: "aisle" }])).toEqual([{ journey: "trips" }, { journey: "seat", wish: "aisle" }]);
  });
});
