import { describe, expect, it } from "vitest";
import { itemsOf, waitingStep } from "@/agent/run";
import { flightsOn } from "@/airline/flights";
import type { OrderResult } from "@/airline/schema";
import { NOW, apiFetch, memoryStorage, trip, type Seen } from "@/test/api";
import { makeStore } from "./store";
import { ask, start } from "./thunks";

// Whole conversations, typed, from the first words to the booking in the
// account. NOW is 10:30 on Tuesday 6 October 2026.

function setup(seen?: Seen) {
  let tick = 0;
  const store = makeStore({ storage: memoryStorage(), fetch: apiFetch({ seen }), now: () => NOW, clock: () => (tick += 3), controllers: new Map() });
  store.dispatch(start());
  const turns = () => store.getState().conversation.turns;
  const last = () => turns().at(-1)!;
  const say = async (...sentences: string[]) => {
    for (const words of sentences) await store.dispatch(ask(words));
  };
  const bookings = () => store.getState().account.account!.bookings;
  const waitingOn = () => waitingStep(last().run)?.widget ?? null;
  return { store, turns, last, say, bookings, waitingOn };
}

describe("whole conversations", () => {
  it("moves a flight, picks a seat and adds a bag from one sentence, for one payment", async () => {
    const seen: Seen = [];
    const { say, last, turns, bookings, waitingOn } = setup(seen);
    await say("Move my London flight to next week, window seat, and add a bag");
    expect(waitingOn()).toBe("date-strip");
    await say("wednesday");
    expect(waitingOn()).toBe("flight-list");
    await say("the earliest");
    expect(waitingOn()).toBe("seat-map");
    await say("you choose");
    expect(waitingOn()).toBe("price-summary");
    await say("yes");

    const flight = flightsOn("DXB", "LHR", "2026-10-14")[0];
    expect(turns()).toHaveLength(1);
    expect(last().run?.status).toBe("done");
    expect(last().run?.checks.every((check) => check.pass)).toBe(true);
    expect(bookings().find((booking) => booking.code === "K7QM2P")).toMatchObject({ flight: { id: flight.id }, bags: trip("LHR").bags + 1 });
    expect(seen.filter((request) => request.path === "/api/orders")).toHaveLength(1);
    expect(last().marks.map((mark) => mark.words)).toEqual(["wednesday", "the earliest", "you choose", "yes"]);
  });

  it("changes the day partway, keeping the trip and winding back to the days", async () => {
    const { say, last, waitingOn } = setup();
    await say("move my london flight to next week", "monday");
    expect(waitingOn()).toBe("flight-list");
    expect(last().run?.results.day).toMatchObject({ date: "2026-10-12" });

    await say("actually make it friday");
    expect(waitingOn()).toBe("flight-list");
    expect(last().run?.results.day).toEqual({ date: "2026-10-09", label: "Fri 9 Oct" });
    expect(last().intents).toEqual([{ journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-09", to: "2026-10-09" } }]);
  });

  it("adds a bag to an order already at the price, pricing it again", async () => {
    const { say, last, waitingOn } = setup();
    await say("a window seat on my london flight", "you choose");
    expect(last().run?.results.quote).toMatchObject({ total: 35 });
    await say("and add two bags");
    expect(waitingOn()).toBe("price-summary");
    expect(last().run?.results.quote).toMatchObject({ total: 35 + 240 });
    expect(last().intents.map((intent) => intent.journey)).toEqual(["seat", "bags"]);
  });

  it("books a new flight by typing, and adds it to the account", async () => {
    const { say, last, bookings, waitingOn } = setup();
    await say("Book a flight");
    expect(waitingOn()).toBe("flight-search");
    await say("Paris");
    expect(waitingOn()).toBe("date-strip");
    await say("friday");
    expect(waitingOn()).toBe("flight-list");
    await say("the cheapest", "yes");

    expect(last().run?.status).toBe("done");
    expect(bookings()).toHaveLength(4);
    const cheapest = [...flightsOn("DXB", "CDG", "2026-10-09")].sort((a, b) => a.price - b.price)[0];
    expect(bookings()[3]).toMatchObject({ flight: { id: cheapest.id }, passenger: "Noor Haddad", status: "confirmed", paid: cheapest.price });
    const order = last().calls.find((record) => record.call.tool === "order")?.result as OrderResult;
    expect(order.receipt).toMatchObject({ bookingCode: bookings()[3].code, total: cheapest.price });
  });

  it("checks in for the flight that is open, and shows the pass again when asked", async () => {
    const { say, last, bookings } = setup();
    await say("check me in", "yes");
    expect(bookings()[0]).toMatchObject({ code: "T5LW4H", checkedIn: true });
    expect(itemsOf(last().run!).at(-1)).toMatchObject({ kind: "widget", widget: "boarding-pass" });

    await say("show my boarding pass");
    expect(last().run?.status).toBe("done");
    expect(itemsOf(last().run!).map((item) => item.kind)).toEqual(["say", "widget"]);
  });

  it("cancels a booking, and takes it out of what is upcoming", async () => {
    const { say, last, bookings } = setup();
    await say("cancel my istanbul trip");
    expect(waitingStep(last().run)?.widget).toBe("refund");
    await say("yes");
    expect(bookings().find((booking) => booking.code === "R3XD8N")).toMatchObject({ status: "cancelled" });

    await say("show my trips");
    expect(itemsOf(last().run!)[0]).toMatchObject({ text: "You have 2 trips coming up." });
  });

  it("keeps a booking when a cancellation is turned down", async () => {
    const { say, last, bookings } = setup();
    await say("cancel my istanbul trip", "no");
    expect(last().closing).toBe("Left unfinished. Nothing was changed.");
    expect(bookings().find((booking) => booking.code === "R3XD8N")?.status).toBe("confirmed");
  });

  it("answers a status question in the middle of nothing, and says when check-in is not open yet", async () => {
    const { say, last } = setup();
    await say("is my flight on time?");
    expect(itemsOf(last().run!)[0]).toMatchObject({ text: "JN 303 to Mumbai is on time, and check-in is open." });
    await say("check me in for istanbul");
    expect(last().run?.status).toBe("done");
    expect(itemsOf(last().run!)).toHaveLength(1);
  });
});
