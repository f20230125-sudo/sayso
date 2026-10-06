import { describe, expect, it } from "vitest";
import { addDays } from "@/airline/dates";
import { flightsOn } from "@/airline/flights";
import type { Account, Flight, OrderResult } from "@/airline/schema";
import { NOW, TODAY, account, apiFetch, trip, type Seen } from "@/test/api";
import { WIDGETS } from "@/widgets/specs";
import { planFor } from "./plan";
import { referencedSteps } from "./reference";
import { advance, answerEvent, itemsOf, reduceRun, startRun, waitingStep } from "./run";
import type { Intent, Json, RunState, Step } from "./types";

// TODAY is Tuesday 6 October 2026, 10:30 in the morning. The demo trips are
// Mumbai tomorrow, London on Thursday the 8th, and Istanbul on Saturday the 24th.

const plan = (intents: Intent[], from: Account = account()) => planFor(intents, { today: TODAY, now: NOW.toISOString(), account: from });
const ids = (steps: Step[]) => steps.map((step) => step.id);
const says = (steps: Step[]) => steps.flatMap((step) => (step.kind === "say" ? [step.text] : []));
const london = trip("LHR");

/** Run a plan to the end, answering each component with what `answers` gives for it. */
async function finish(intents: Intent[], answers: Record<string, (props: never) => unknown>, from: Account = account()) {
  const seen: Seen = [];
  let tick = 0;
  const deps = { fetch: apiFetch({ seen }), signal: new AbortController().signal, now: () => (tick += 4) };
  let run: RunState = startRun(plan(intents, from));
  const shown: string[] = [];

  for (let turns = 0; turns < 12; turns += 1) {
    run = await advance(run, deps, () => {});
    const step = waitingStep(run);
    if (!step) break;
    shown.push(step.widget);
    const item = itemsOf(run).at(-1);
    if (item?.kind !== "widget") throw new Error("The run is waiting but shows nothing.");
    // What a plan shows must fit the component's own schema, every time.
    expect(WIDGETS[step.widget].props.safeParse(item.props).success, `${step.widget} props`).toBe(true);
    const answer = answers[step.widget];
    if (!answer) throw new Error(`No answer was given for "${step.widget}".`);
    const event = answerEvent(run, step.id, answer(item.props as never) as Json);
    if (!event) throw new Error(`"${step.widget}" did not accept the answer.`);
    run = reduceRun(run, event);
  }
  return { run, seen, shown, order: run.results.order as OrderResult | undefined };
}

const firstDay = (props: { days: { date: string }[] }) => ({ date: props.days[1].date, label: "a day" });
const firstFlight = (props: { flights: Flight[]; current: Flight | null }) => ({ flight: props.flights.find((flight) => flight.id !== props.current?.id) });
const windowSeat = (props: { map: { rows: { seats: { id: string; kinds: string[]; price: number; taken: boolean }[] }[] } }) => {
  const seat = props.map.rows.flatMap((row) => row.seats).find((entry) => !entry.taken && entry.kinds.length === 1 && entry.kinds[0] === "window")!;
  return { seat: seat.id, kinds: seat.kinds, price: seat.price };
};
const yes = () => ({ confirmed: true });

describe("planning the other journeys", () => {
  it("plans three journeys as one order, with the seat on the new flight", () => {
    const { steps, expectations } = plan([
      { journey: "seat", wish: "window", trip: { place: "LHR" } },
      { journey: "bags", add: 1, trip: { place: "LHR" } },
      { journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-12", to: "2026-10-18" } },
    ]);
    // Said seat first, but the flight is chosen before the seat on it.
    expect(ids(steps)).toEqual(["trip", "days", "day-lead", "day", "flights", "pick-lead", "pick", "seats", "seat-lead", "seat", "bags", "quote", "pay-lead", "pay", "order", "done-lead", "receipt"]);
    expect(steps.find((step) => step.id === "seats")).toMatchObject({ args: { flightId: "{{pick.flight.id}}" } });
    expect(steps.find((step) => step.id === "seat")).toMatchObject({ props: { flight: "{{pick.flight}}", current: null } });
    expect(steps.find((step) => step.id === "bags")).toMatchObject({ kind: "set", value: { count: london.bags + 1, added: 1 } });
    expect(steps.find((step) => step.id === "quote")).toMatchObject({
      args: { booking: "{{trip.booking}}", changes: [{ type: "move" }, { type: "seat" }, { type: "bags" }] },
    });
    expect(expectations.map((expectation) => expectation.kind)).toEqual([
      "date-within",
      "flight-on-booking",
      "seat-kind",
      "seat-on-booking",
      "bags-on-booking",
      "charged-as-quoted",
    ]);
  });

  it("skips the choice of day when the day was named, and works a shift out from the booking", () => {
    const named = plan([{ journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-15", to: "2026-10-15" } }]);
    expect(named.steps[1]).toEqual({ id: "day", kind: "set", value: { date: "2026-10-15", label: "Thu 15 Oct" }, label: "Look at Thu 15 Oct" });
    expect(ids(named.steps)).not.toContain("days");

    const shifted = plan([{ journey: "change-flight", trip: { place: "LHR" }, when: { shiftDays: 2 } }]);
    expect(shifted.steps[1]).toMatchObject({ kind: "set", value: { date: addDays(london.flight.date, 2) } });
  });

  it("shows the days around the flight when no day was named, and the days ahead when the day named has passed", () => {
    const open = plan([{ journey: "change-flight", trip: { place: "IST" } }]);
    expect(open.steps[1]).toMatchObject({ tool: "calendar", args: { start: addDays(trip("IST").flight.date, -3), days: 10 } });

    const past = plan([{ journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-01", to: "2026-10-01" } }]);
    expect(past.steps[1]).toMatchObject({ tool: "calendar", args: { start: addDays(TODAY, 1) } });
    expect(says(past.steps)[0]).toBe("That date has passed. Here are the days ahead, each with its lowest fare.");
    expect(past.expectations.map((expectation) => expectation.kind)).not.toContain("date-within");
  });

  it("says that a seat does not move with the flight, unless a new one is being chosen", () => {
    const text = "Seats belong to a flight, so yours does not move with you. You can choose a new one once this is done.";
    expect(says(plan([{ journey: "change-flight", trip: { place: "LHR" } }]).steps)).toContain(text);
    expect(says(plan([{ journey: "change-flight", trip: { place: "LHR" } }, { journey: "seat" }]).steps)).not.toContain(text);
  });

  it("asks how many bags only when the words did not say", () => {
    expect(ids(plan([{ journey: "bags", trip: { place: "IST" } }]).steps).slice(0, 3)).toEqual(["trip", "bags-lead", "bags"]);
    expect(plan([{ journey: "bags", trip: { place: "IST" } }]).steps[2]).toMatchObject({ widget: "bag-stepper", props: { current: "{{trip.booking.bags}}", add: 1, max: 5, price: 120 } });
    // The trip has to be asked for, so the count on it is not known yet.
    expect(plan([{ journey: "bags", add: 2 }]).steps.at(2)).toMatchObject({ id: "bags-lead" });
  });

  it("stops at the most bags a booking can hold", () => {
    const full = account();
    full.bookings[1].bags = 5;
    expect(says(plan([{ journey: "bags", add: 1, trip: { place: "LHR" } }], full).steps)).toEqual(["You already have 5 checked bags, which is the most one booking can hold."]);
    full.bookings[1].bags = 4;
    const capped = plan([{ journey: "bags", add: 3, trip: { place: "LHR" } }], full);
    expect(capped.steps[1]).toMatchObject({ value: { count: 5, added: 1 } });
    expect(says(capped.steps)[0]).toBe("A booking can hold 5 checked bags, so I have added 1, not 3.");
  });

  it("plans check-in with no price to agree to, ending in a boarding pass", () => {
    const { steps, expectations } = plan([{ journey: "check-in", trip: { place: "BOM" } }]);
    expect(ids(steps)).toEqual(["trip", "passenger-lead", "passenger", "order", "pass-status", "pass-lead", "pass"]);
    expect(steps[3]).toMatchObject({ tool: "order", args: { changes: [{ type: "check-in" }], expectedTotal: 0 }, label: "Check you in" });
    expect(expectations).toEqual([{ kind: "checked-in" }]);
  });

  it("says when check-in opens for a flight that is too far off", () => {
    const opens = "Check-in for your flight to Istanbul on Sat 24 Oct opens on Thursday 22 October at";
    const [line] = says(plan([{ journey: "check-in", trip: { place: "IST" } }]).steps);
    expect(line.startsWith(opens)).toBe(true);
    expect(line.endsWith("48 hours before it leaves.")).toBe(true);
  });

  it("asks which flight when check-in is open for more than one, offering only those", () => {
    // At 10:30 on Tuesday, Thursday's 12:40 flight is still more than 48 hours off.
    expect(plan([{ journey: "check-in" }]).steps[0]).toMatchObject({ kind: "set", value: { booking: { code: "T5LW4H" } } });

    const later = planFor([{ journey: "check-in" }], { today: TODAY, now: new Date(2026, 9, 6, 15, 0).toISOString(), account: account() });
    expect(later.steps[1]).toMatchObject({ widget: "trip-chooser", props: { bookings: [{ code: "T5LW4H" }, { code: "K7QM2P" }] } });
  });

  it("shows the boarding pass again for a flight already checked in", () => {
    const done = account();
    done.bookings[0].checkedIn = true;
    const { steps } = plan([{ journey: "check-in" }], done);
    expect(says(steps)[0]).toBe("You are already checked in for your flight to Mumbai on Wed 7 Oct. Here is your boarding pass.");
    expect(ids(steps)).toEqual(["checkin-done", "trip", "pass-status", "pass"]);
  });

  it("has a seat chosen first when checking in without one", () => {
    const seatless = account();
    seatless.bookings[0].seat = null;
    const { steps } = plan([{ journey: "check-in", trip: { place: "BOM" } }], seatless);
    expect(says(steps)[0]).toBe("You need a seat before you can check in, so let us pick one first.");
    expect(ids(steps)).toEqual(["trip", "checkin-seat", "seats", "seat-lead", "seat", "passenger-lead", "passenger", "quote", "pay-lead", "pay", "order", "done-lead", "receipt", "pass-status", "pass-lead", "pass"]);
  });

  it("plans a cancellation by itself, leaving out changes to the booking being cancelled", () => {
    const { steps, expectations } = plan([{ journey: "seat", wish: "window" }, { journey: "cancel", trip: { place: "IST" } }]);
    expect(ids(steps)).toEqual(["trip", "left-out", "quote", "pay-lead", "pay", "order", "done-lead", "receipt"]);
    expect(steps.find((step) => step.id === "pay")).toMatchObject({ widget: "refund" });
    expect(steps.find((step) => step.id === "quote")).toMatchObject({ args: { changes: [{ type: "cancel" }] } });
    expect(expectations).toEqual([{ kind: "cancelled" }, { kind: "charged-as-quoted" }]);
  });

  it("plans a booking from what is known, asking for the rest", () => {
    const known = plan([{ journey: "book", to: "CDG", when: { from: "2026-10-16", to: "2026-10-16" } }]);
    expect(ids(known.steps)).toEqual(["where", "day", "flights", "pick-lead", "pick", "quote", "pay-lead", "pay", "order", "done-lead", "receipt"]);
    expect(known.steps[0]).toMatchObject({ kind: "set", value: { from: "DXB", to: "CDG", toCity: "Paris" } });
    expect(known.steps.find((step) => step.id === "quote")).toMatchObject({
      args: { booking: null, changes: [{ type: "book", flightId: "{{pick.flight.id}}", passenger: "Noor Haddad" }] },
    });

    const noDay = plan([{ journey: "book", to: "CDG" }]);
    expect(ids(noDay.steps).slice(0, 4)).toEqual(["where", "days", "day-lead", "day"]);
    expect(noDay.steps[1]).toMatchObject({ tool: "calendar", args: { from: "DXB", to: "CDG", start: addDays(TODAY, 1), days: 10 } });

    const nothing = plan([{ journey: "book" }]);
    expect(nothing.steps[1]).toMatchObject({ id: "where", widget: "flight-search", props: { earliest: TODAY } });
    expect(nothing.steps[3]).toMatchObject({ tool: "searchFlights", args: { from: "DXB", to: "{{where.to}}", date: "{{day.date}}" } });
  });

  it("books the way back when the flight is from somewhere to Dubai", () => {
    expect(plan([{ journey: "book", from: "LHR", to: "DXB" }]).steps[0]).toMatchObject({ value: { from: "LHR", to: "DXB", toCity: "Dubai" } });
    expect(plan([{ journey: "book", from: "LHR" }]).steps[0]).toMatchObject({ value: { from: "LHR", to: "DXB" } });
  });

  it("puts a seat and a bag on a new booking in the same order", () => {
    const { steps } = plan([{ journey: "seat", wish: "aisle" }, { journey: "bags", add: 2 }, { journey: "book", to: "CDG", when: { from: "2026-10-16", to: "2026-10-16" } }]);
    expect(steps.find((step) => step.id === "quote")).toMatchObject({ args: { booking: null, changes: [{ type: "book" }, { type: "seat" }, { type: "bags", count: "{{bags.count}}" }] } });
    expect(steps.find((step) => step.id === "bags")).toMatchObject({ kind: "set", value: { count: 2, added: 2 } });
  });

  it("looks at the next flight when status is asked with no flight named", () => {
    const { steps } = plan([{ journey: "status" }]);
    expect(steps[0]).toMatchObject({ kind: "set", value: { booking: { code: "T5LW4H" } } });
    expect(steps[1]).toMatchObject({ tool: "status", args: { flightId: "{{trip.booking.flight.id}}", at: NOW.toISOString() } });
  });

  it("only ever refers back to a step that comes earlier, whatever is asked", () => {
    const requests: Intent[][] = [
      [{ journey: "status" }],
      [{ journey: "change-flight" }],
      [{ journey: "change-flight", trip: { place: "LHR" } }, { journey: "seat" }, { journey: "bags" }],
      [{ journey: "check-in" }],
      [{ journey: "cancel" }],
      [{ journey: "book" }, { journey: "seat" }, { journey: "bags" }],
      [{ journey: "book", to: "SIN" }],
      [{ journey: "trips" }, { journey: "status", trip: { place: "LHR" } }, { journey: "bags", add: 1 }],
    ];
    for (const intents of requests) {
      const { steps } = plan(intents);
      expect(new Set(ids(steps)).size, JSON.stringify(intents)).toBe(steps.length);
      steps.forEach((step, index) => {
        const earlier = new Set(ids(steps.slice(0, index)));
        const uses = step.kind === "say" ? step.text : step.kind === "tool" ? step.args : step.kind === "show" ? step.props : step.value;
        for (const used of referencedSteps(uses)) expect(earlier.has(used), `${step.id} refers to ${used}`).toBe(true);
      });
    }
  });
});

describe("running the other journeys", () => {
  it("moves a flight, picks a seat on the new one and adds a bag, for one payment", async () => {
    const { run, seen, shown, order } = await finish(
      [
        { journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-12", to: "2026-10-18" } },
        { journey: "seat", wish: "window", trip: { place: "LHR" } },
        { journey: "bags", add: 1, trip: { place: "LHR" } },
      ],
      { "date-strip": firstDay, "flight-list": firstFlight, "seat-map": windowSeat, "price-summary": yes },
    );
    expect(shown).toEqual(["date-strip", "flight-list", "seat-map", "price-summary"]);
    expect(run.status).toBe("done");

    const flight = flightsOn("DXB", "LHR", "2026-10-13")[0];
    expect(order?.booking).toMatchObject({ code: "K7QM2P", flight: { id: flight.id }, bags: london.bags + 1 });
    expect(order?.booking.seat).toMatch(/^\d+[AF]$/);
    expect(order?.receipt.lines.map((line) => line.label)).toEqual([
      `Fare difference, JN 203 to ${flight.number}`,
      "Change fee",
      `Seat ${order?.booking.seat}, window`,
      "1 extra checked bag",
    ]);
    expect(order?.receipt.total).toBe(flight.price - london.flight.price + 150 + 35 + 120);
    expect(run.checks.map((check) => check.pass)).toEqual([true, true, true, true, true, true]);
    expect(run.checks[0].label).toBe(`You asked for a day from Mon 12 Oct to Sun 18 Oct. ${flight.number} leaves on Tue 13 Oct.`);

    expect(seen.map((request) => request.path.split("?")[0])).toEqual([
      "/api/flights/calendar",
      "/api/flights",
      `/api/flights/${flight.id}/seats`,
      "/api/quotes",
      "/api/orders",
    ]);
    expect(seen.filter((request) => request.path === "/api/orders")).toHaveLength(1);
  });

  it("says so when the day chosen is outside the days asked for", async () => {
    const outside = flightsOn("DXB", "LHR", "2026-10-20")[0];
    const { run } = await finish([{ journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-15", to: "2026-10-15" } }], {
      "flight-list": () => ({ flight: outside }),
      "price-summary": yes,
    });
    expect(run.checks[0]).toEqual({ pass: false, label: `You asked to fly on Thu 15 Oct, and picked ${outside.number} on Tue 20 Oct, which is outside that.` });
  });

  it("checks in and shows a boarding pass that fits its schema", async () => {
    const { run, shown, order, seen } = await finish([{ journey: "check-in", trip: { place: "BOM" } }], { "passenger-check": yes });
    expect(shown).toEqual(["passenger-check"]);
    expect(order?.booking.checkedIn).toBe(true);
    expect(run.checks).toEqual([{ pass: true, label: "You are checked in for JN 303." }]);
    expect(seen.map((request) => request.path.split("?")[0])).toEqual(["/api/orders", `/api/flights/${trip("BOM").flight.id}/status`]);
    const pass = itemsOf(run).at(-1);
    expect(pass).toMatchObject({ kind: "widget", widget: "boarding-pass", state: "shown" });
    expect(WIDGETS["boarding-pass"].props.safeParse(pass?.kind === "widget" ? pass.props : null).success).toBe(true);
  });

  it("cancels a booking and refunds it less the fee", async () => {
    const istanbul = trip("IST");
    const { run, shown, order } = await finish([{ journey: "cancel", trip: { place: "IST" } }], { refund: yes });
    expect(shown).toEqual(["refund"]);
    expect(order?.booking.status).toBe("cancelled");
    expect(order?.receipt.total).toBe(-(istanbul.paid - 200));
    expect(run.checks).toEqual([
      { pass: true, label: "Booking R3XD8N is cancelled." },
      { pass: true, label: `Refunded AED ${(istanbul.paid - 200).toLocaleString("en-US")}, the amount you agreed to.` },
    ]);
  });

  it("books a new flight with a seat, giving it a reference", async () => {
    const { run, shown, order } = await finish([{ journey: "book", to: "CDG", when: { from: "2026-10-16", to: "2026-10-16" } }, { journey: "seat", wish: "window" }], {
      "flight-list": firstFlight,
      "seat-map": windowSeat,
      "price-summary": yes,
    });
    expect(shown).toEqual(["flight-list", "seat-map", "price-summary"]);
    const flight = flightsOn("DXB", "CDG", "2026-10-16")[0];
    expect(order?.booking).toMatchObject({ passenger: "Noor Haddad", flight: { id: flight.id }, paid: flight.price + 35 });
    expect(order?.booking.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(run.checks.every((check) => check.pass)).toBe(true);
    expect(run.checks[0].label).toBe(`You asked for Paris. ${flight.number} flies there.`);
  });

  it("books from a filled-in search form", async () => {
    const { shown, order } = await finish([{ journey: "book" }], {
      "flight-search": () => ({ to: "SIN", toCity: "Singapore", date: "2026-11-02", label: "Mon 2 Nov" }),
      "flight-list": firstFlight,
      "price-summary": yes,
    });
    expect(shown).toEqual(["flight-search", "flight-list", "price-summary"]);
    expect(order?.booking.flight).toMatchObject({ to: "SIN", date: "2026-11-02" });
  });

  it("asks how many bags, and adds that many", async () => {
    const { order, run } = await finish([{ journey: "bags", trip: { place: "IST" } }], {
      "bag-stepper": (props: { current: number }) => ({ count: props.current + 2, added: 2 }),
      "price-summary": yes,
    });
    expect(order?.booking.bags).toBe(2);
    expect(order?.receipt.total).toBe(240);
    expect(run.checks[0]).toEqual({ pass: true, label: "Your booking now has 2 checked bags." });
  });

  it("answers a status question with a line and a timeline, changing nothing", async () => {
    const { run, shown, seen } = await finish([{ journey: "status" }], {});
    expect(shown).toEqual([]);
    expect(run.status).toBe("done");
    expect(run.checks).toEqual([]);
    expect(itemsOf(run)[0]).toMatchObject({ kind: "say", text: "JN 303 to Mumbai is on time, and check-in is open." });
    expect(itemsOf(run)[1]).toMatchObject({ kind: "widget", widget: "status-timeline" });
    expect(seen).toHaveLength(1);
  });
});
