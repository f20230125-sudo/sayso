import { describe, expect, it } from "vitest";
import { seatMapOf } from "@/airline/seats";
import { TODAY, account, freeSeat, trip } from "@/test/api";
import type { Context, Json } from "../types";
import { understandByRules } from "./rules";

// TODAY is Tuesday 6 October 2026.

const day = (date: string) => ({ from: date, to: date });
const nextWeek = { from: "2026-10-12", to: "2026-10-18" };
const read = (words: string, active?: Context["active"]) => understandByRules(words, { today: TODAY, account: account(), ...(active ? { active } : {}) });
const intents = (words: string) => {
  const understood = read(words);
  return understood.kind === "request" ? understood.intents : understood;
};

describe("understanding all eight journeys", () => {
  it("reads three requests in one sentence, all for the trip that was named", () => {
    expect(intents("Move my London flight to next week, window seat, and add a bag")).toEqual([
      { journey: "change-flight", trip: { place: "LHR" }, when: nextWeek },
      { journey: "seat", wish: "window", trip: { place: "LHR" } },
      { journey: "bags", add: 1, trip: { place: "LHR" } },
    ]);
  });

  it("tells the date that names a flight from the date it is to move to", () => {
    expect(intents("move my thursday flight to next week")).toEqual([{ journey: "change-flight", trip: { weekday: 4 }, when: nextWeek }]);
    expect(intents("change my flight to friday")).toEqual([{ journey: "change-flight", when: day("2026-10-09") }]);
    expect(intents("reschedule tomorrow's flight to saturday")).toEqual([
      { journey: "change-flight", trip: { date: "2026-10-07" }, when: day("2026-10-10") },
    ]);
    expect(intents("push my london flight two days later")).toEqual([{ journey: "change-flight", trip: { place: "LHR" }, when: { shiftDays: 2 } }]);
    expect(intents("can I get an earlier flight")).toEqual([{ journey: "change-flight" }]);
  });

  it("reads a request to book, with where and when", () => {
    expect(intents("Book a flight to Paris next Friday")).toEqual([{ journey: "book", to: "CDG", when: day("2026-10-16") }]);
    expect(intents("fly to london tomorrow")).toEqual([{ journey: "book", to: "LHR", when: day("2026-10-07") }]);
    expect(intents("book a flight from London to Dubai on 15 Oct")).toEqual([{ journey: "book", from: "LHR", to: "DXB", when: day("2026-10-15") }]);
    expect(intents("I need a new flight")).toEqual([{ journey: "book" }]);
  });

  it("does not take a flight that is already booked for a request to book one", () => {
    expect(intents("add a bag to my flight to london")).toEqual([{ journey: "bags", add: 1, trip: { place: "LHR" } }]);
    expect(intents("book a window seat")).toEqual([{ journey: "seat", wish: "window" }]);
    expect(intents("is the flight to london on time")).toEqual([{ journey: "status", trip: { place: "LHR" } }]);
  });

  it("reads a booking and a seat on it together", () => {
    expect(intents("book me a flight to london with a window seat")).toEqual([
      { journey: "book", to: "LHR" },
      { journey: "seat", wish: "window" },
    ]);
  });

  it("reads bags, with how many when the words say", () => {
    expect(intents("add two bags to my Istanbul flight")).toEqual([{ journey: "bags", add: 2, trip: { place: "IST" } }]);
    expect(intents("I need more luggage")).toEqual([{ journey: "bags" }]);
    expect(intents("buy an extra bag")).toEqual([{ journey: "bags", add: 1 }]);
    expect(intents("another suitcase please")).toEqual([{ journey: "bags", add: 1 }]);
  });

  it("reads check-in, cancelling and status", () => {
    expect(intents("Check me in")).toEqual([{ journey: "check-in" }]);
    expect(intents("show my boarding pass")).toEqual([{ journey: "check-in" }]);
    expect(intents("cancel my Istanbul trip")).toEqual([{ journey: "cancel", trip: { place: "IST" } }]);
    expect(intents("I want a refund")).toEqual([{ journey: "cancel" }]);
    expect(intents("Is my flight on time?")).toEqual([{ journey: "status" }]);
    expect(intents("what gate is JN 303")).toEqual([{ journey: "status", trip: { flight: "JN 303" } }]);
    expect(intents("when does my london flight leave")).toEqual([{ journey: "status", trip: { place: "LHR" } }]);
  });
});

describe("words said to the other components", () => {
  const london = trip("LHR");
  const moving = [{ journey: "change-flight" as const, trip: { place: "LHR" } }];
  const days = ["2026-10-12", "2026-10-13", "2026-10-14"].map((date) => ({ date, price: 1300, flights: 3 }));
  const atDays = { intents: moving, widget: "date-strip" as const, props: { days, current: london.flight.date, currentPrice: 1500 } as unknown as Json };
  const flights = [
    { ...london.flight, id: "a", number: "JN 201", departs: "08:30", price: 1420 },
    { ...london.flight, id: "b", number: "JN 203", departs: "12:40", price: 1260 },
    { ...london.flight, id: "c", number: "JN 205", departs: "15:00", price: 1325 },
  ];
  const atFlights = { intents: moving, widget: "flight-list" as const, props: { flights, current: null } as unknown as Json };
  const atBags = { intents: [{ journey: "bags" as const }], widget: "bag-stepper" as const, props: { current: 1, add: 1, max: 5, price: 120 } as Json };
  const atSearch = { intents: [{ journey: "book" as const }], widget: "flight-search" as const, props: {} as Json };
  const picked = (words: string, active = atFlights) => (read(words, active) as unknown as { answer: { flight: { id: string } } }).answer.flight.id;

  it("takes a day on screen as the answer, and a day that is not as a change of plan", () => {
    expect(read("tuesday", atDays)).toEqual({ kind: "answer", answer: { date: "2026-10-13", label: "Tue 13 Oct" } });
    expect(read("the 14th", atDays)).toEqual({ kind: "answer", answer: { date: "2026-10-14", label: "Wed 14 Oct" } });
    expect(read("make it the 25th", atDays)).toEqual({ kind: "amend", intents: [{ journey: "change-flight", when: day("2026-10-25") }] });
  });

  it("picks a flight by its number, its time or its place in the list", () => {
    expect(picked("jn 205")).toBe("c");
    expect(picked("the 12:40")).toBe("b");
    expect(picked("8.30")).toBe("a");
    expect(picked("the cheapest")).toBe("b");
    expect(picked("the earliest one")).toBe("a");
    expect(picked("the last one")).toBe("c");
    expect(picked("second")).toBe("b");
    expect(read("the nicest", atFlights)).toEqual({ kind: "unknown" });
  });

  it("never offers the flight the traveller is already on", () => {
    expect(picked("the earliest", { ...atFlights, props: { flights, current: flights[0] } as unknown as Json })).toBe("b");
  });

  it("takes a number as how many bags to add", () => {
    expect(read("two", atBags)).toEqual({ kind: "answer", answer: { count: 3, added: 2 } });
    expect(read("1 more", atBags)).toEqual({ kind: "answer", answer: { count: 2, added: 1 } });
    expect(read("5", atBags)).toEqual({ kind: "cannot", why: "A booking can hold 5 checked bags, and you have 1." });
  });

  it("takes yes for a refund and for the passenger check", () => {
    expect(read("yes", { intents: [{ journey: "cancel" }], widget: "refund", props: {} as Json })).toEqual({ kind: "answer", answer: { confirmed: true } });
    expect(read("confirm", { intents: [{ journey: "check-in" }], widget: "passenger-check", props: {} as Json })).toEqual({
      kind: "answer",
      answer: { confirmed: true },
    });
  });

  it("fills the flight search from a place and a day, or changes the plan from a place alone", () => {
    expect(read("Paris next friday", atSearch)).toEqual({ kind: "answer", answer: { to: "CDG", toCity: "Paris", date: "2026-10-16", label: "Fri 16 Oct" } });
    expect(read("Paris", atSearch)).toEqual({ kind: "amend", intents: [{ journey: "book", to: "CDG" }] });
    expect(read("book a flight to Cairo", atSearch)).toEqual({ kind: "request", intents: [{ journey: "book", to: "CAI" }] });
  });

  it("lets the desk pick a seat when asked to", () => {
    const atSeats = {
      intents: [{ journey: "seat" as const, wish: "window" as const }],
      widget: "seat-map" as const,
      props: { map: seatMapOf(london.flight.id), wish: "window", current: london.seat } as unknown as Json,
    };
    expect(read("you choose", atSeats)).toMatchObject({ kind: "answer", answer: { kinds: ["window"], price: 35 } });
    expect(read("you choose", atSeats)).toMatchObject({ answer: { seat: expect.stringMatching(/^\d+[AF]$/) } });
    expect(freeSeat(london, "window").id).toMatch(/^\d+[AF]$/);
  });

  it("folds another request into the order under way, and reads cancel as leaving it", () => {
    const atSeats = {
      intents: [{ journey: "seat" as const }],
      widget: "seat-map" as const,
      props: { map: seatMapOf(london.flight.id), wish: null, current: null } as unknown as Json,
    };
    expect(read("and add a bag", atSeats)).toEqual({ kind: "amend", intents: [{ journey: "bags", add: 1 }] });
    expect(read("cancel", atSeats)).toEqual({ kind: "abandon" });
    expect(read("cancel my london flight", atSeats)).toEqual({ kind: "request", intents: [{ journey: "cancel", trip: { place: "LHR" } }] });
  });
});
