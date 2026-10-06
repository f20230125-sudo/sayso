import { describe, expect, it } from "vitest";
import type { OrderResult } from "@/airline/schema";
import { NOW, TODAY, account, apiFetch, freeSeat, takenSeat, trip, type Seen } from "@/test/api";
import { matchTrips, planFor } from "./plan";
import { MissingReference, fill, lookup, referencedSteps } from "./reference";
import { replan } from "./replan";
import { advance, answerEvent, itemsOf, reduceRun, startRun, waitingStep } from "./run";
import { ToolError, callTool } from "./tools";
import type { Deps, Intent, Json, Plan, RunEvent, RunState, Step } from "./types";

const context = { today: TODAY, now: NOW.toISOString(), account: account() };
const plan = (intents: Intent[], focus: string | null = null) => planFor(intents, { ...context, focus });
const ids = (steps: Step[]) => steps.map((step) => step.id);

function deps(options: Parameters<typeof apiFetch>[0] = {}, signal: AbortSignal = new AbortController().signal): Deps {
  let tick = 0;
  return { fetch: apiFetch(options), signal, now: () => (tick += 5) };
}

/** Advance a run, collecting what it reports. */
async function go(run: RunState, using: Deps = deps()): Promise<{ run: RunState; events: RunEvent[] }> {
  const events: RunEvent[] = [];
  const after = await advance(run, using, (event) => events.push(event));
  return { run: after, events };
}

/** Answer the component a run is waiting on, as the store would. */
function answered(run: RunState, answer: Json): RunState {
  const step = waitingStep(run);
  if (!step) throw new Error("The run is not waiting.");
  const event = answerEvent(run, step.id, answer);
  if (!event) throw new Error(`"${step.widget}" did not accept that answer.`);
  return reduceRun(run, event);
}

const london = trip("LHR");
const seatIntent: Intent = { journey: "seat", trip: { place: "LHR" }, wish: "window" };

describe("references", () => {
  const scope = { trip: { booking: { code: "K7QM2P", seat: null, bags: 1 } }, flights: { flights: [{ id: "a" }, { id: "b" }] }, quote: { total: 35 } } as Record<string, Json>;

  it("looks a value up by its path", () => {
    expect(lookup(scope, "trip.booking.code")).toBe("K7QM2P");
    expect(lookup(scope, "flights.flights[1].id")).toBe("b");
    expect(lookup(scope, "trip.booking.seat")).toBeNull();
    expect(lookup(scope, "trip.booking.nothing")).toBeUndefined();
    expect(lookup(scope, "flights.flights[5]")).toBeUndefined();
    expect(lookup(scope, "trip.booking.code.length")).toBeUndefined();
    expect(lookup(scope, "trip.constructor")).toBeUndefined();
  });

  it("keeps the type of a value that is the whole string", () => {
    expect(fill("{{quote.total}}", scope)).toBe(35);
    expect(fill("{{ trip.booking }}", scope)).toEqual({ code: "K7QM2P", seat: null, bags: 1 });
    expect(fill("{{trip.booking.seat}}", scope)).toBeNull();
  });

  it("writes a value into a longer string", () => {
    expect(fill("Booking {{trip.booking.code}} costs {{quote.total}}.", scope)).toBe("Booking K7QM2P costs 35.");
  });

  it("fills references however deep they sit, and leaves the rest alone", () => {
    expect(fill({ a: ["{{quote.total}}", { b: "{{flights.flights[0].id}}" }], c: 7, d: null, e: "plain" }, scope)).toEqual({
      a: [35, { b: "a" }],
      c: 7,
      d: null,
      e: "plain",
    });
  });

  it("refuses a reference to something nothing has produced", () => {
    expect(() => fill("{{seat.seat}}", scope)).toThrow(MissingReference);
    expect(() => fill("Seat {{seat.seat}}", scope)).toThrow(MissingReference);
  });

  it("lists the steps a value refers to", () => {
    expect(referencedSteps({ a: "{{trip.booking}}", b: ["x {{quote.total}} y {{trip.booking.code}}"], c: 3 }).sort()).toEqual(["quote", "trip"]);
  });
});

describe("matching a trip to the words", () => {
  const bookings = account().bookings;

  it("matches by place, day of the week, date, reference, or being next", () => {
    expect(matchTrips({ place: "LHR" }, bookings)).toEqual([london]);
    expect(matchTrips({ weekday: 4 }, bookings)).toEqual([london]);
    expect(matchTrips({ date: "2026-10-07" }, bookings)).toEqual([trip("BOM")]);
    expect(matchTrips({ code: "r3xd8n" }, bookings)).toEqual([trip("IST")]);
    expect(matchTrips({ next: true }, bookings)).toEqual([bookings[0]]);
  });

  it("matches everything when nothing is said, and nothing when nothing fits", () => {
    expect(matchTrips(undefined, bookings)).toHaveLength(3);
    expect(matchTrips({ place: "CDG" }, bookings)).toEqual([]);
    expect(matchTrips({ place: "LHR", weekday: 1 }, bookings)).toEqual([]);
  });
});

describe("planning", () => {
  it("plans showing the trips", () => {
    const { steps, expectations } = plan([{ journey: "trips" }]);
    expect(steps).toMatchObject([
      { kind: "say", text: "You have 3 trips coming up." },
      { kind: "show", widget: "trips", waits: false },
    ]);
    expect(expectations).toEqual([]);
  });

  it("says so when there are no trips", () => {
    const empty = { ...account(), bookings: [] };
    expect(planFor([{ journey: "trips" }], { ...context, account: empty }).steps).toMatchObject([{ kind: "say", text: "You have no upcoming trips." }]);
    expect(planFor([seatIntent], { ...context, account: empty }).steps).toMatchObject([{ kind: "say", text: "You have no upcoming trips to change." }]);
  });

  it("plans a seat change as far as one price, one confirmation and one receipt", () => {
    const { steps, expectations } = plan([seatIntent]);
    expect(ids(steps)).toEqual(["trip", "seats", "seat-lead", "seat", "quote", "pay-lead", "pay", "order", "done-lead", "receipt"]);
    expect(steps[0]).toMatchObject({ kind: "set", value: { booking: london }, label: "Use your trip to London on Thu 8 Oct" });
    expect(steps[3]).toMatchObject({ kind: "show", widget: "seat-map", waits: true, props: { wish: "window", preselect: null } });
    expect(steps[6]).toMatchObject({ kind: "show", widget: "price-summary", waits: true });
    expect(expectations).toEqual([{ kind: "seat-kind", wish: "window", seatStep: "seat" }, { kind: "seat-on-booking", seatStep: "seat" }, { kind: "charged-as-quoted" }]);
  });

  it("asks which trip when the words could mean several", () => {
    const { steps } = plan([{ journey: "seat", wish: "aisle" }]);
    expect(steps.slice(0, 2)).toMatchObject([
      { kind: "say", text: "Which trip is this for?" },
      { id: "trip", kind: "show", widget: "trip-chooser", waits: true },
    ]);
    expect((steps[1] as Extract<Step, { kind: "show" }>).props).toMatchObject({ bookings: [{ code: "T5LW4H" }, { code: "K7QM2P" }, { code: "R3XD8N" }] });
  });

  it("carries on with the trip the conversation was about when none is named", () => {
    expect(plan([{ journey: "seat" }], "R3XD8N").steps[0]).toMatchObject({ kind: "set", value: { booking: { code: "R3XD8N" } } });
    // A trip that is named still wins over the one in focus.
    expect(plan([seatIntent], "R3XD8N").steps[0]).toMatchObject({ kind: "set", value: { booking: { code: "K7QM2P" } } });
  });

  it("offers every trip when the one named cannot be found", () => {
    const { steps } = plan([{ journey: "seat", trip: { place: "CDG" } }]);
    expect(steps[0]).toMatchObject({ kind: "say", text: "I could not find a trip like that. Which of these do you mean?" });
    expect((steps[1] as Extract<Step, { kind: "show" }>).props).toMatchObject({ bookings: [{}, {}, {}] });
  });

  it("only ever refers back to a step that comes earlier, and names each step once", () => {
    for (const intents of [[seatIntent], [{ journey: "seat" } as Intent], [{ journey: "trips" } as Intent, seatIntent]]) {
      const { steps } = plan(intents);
      expect(new Set(ids(steps)).size).toBe(steps.length);
      steps.forEach((step, index) => {
        const earlier = new Set(ids(steps.slice(0, index)));
        const uses = step.kind === "say" ? step.text : step.kind === "tool" ? step.args : step.kind === "show" ? step.props : null;
        for (const used of referencedSteps(uses)) expect(earlier.has(used), `${step.id} refers to ${used}`).toBe(true);
      });
    }
  });
});

describe("running a plan", () => {
  it("runs a seat change from the words to the receipt", async () => {
    const seen: Seen = [];
    const using = deps({ seen });
    const seat = freeSeat(london, "window");

    // Up to the seat map, which waits.
    let { run, events } = await go(startRun(plan([seatIntent])), using);
    expect(events.map((event) => event.type)).toEqual(["set", "tool-started", "tool-finished", "said", "shown"]);
    expect(run.status).toBe("waiting");
    expect(waitingStep(run)?.widget).toBe("seat-map");
    expect(itemsOf(run).map((item) => (item.kind === "widget" ? `${item.widget}:${item.state}` : item.kind))).toEqual(["say", "seat-map:active"]);
    expect(itemsOf(run)[0]).toMatchObject({ text: "Here is the cabin on JN 203 to London. Free window seats are marked." });

    // The traveller picks a seat: on to the price, which waits.
    ({ run, events } = await go(answered(run, { seat: seat.id, kinds: seat.kinds, price: seat.price }), using));
    expect(events.map((event) => event.type)).toEqual(["tool-started", "tool-finished", "said", "shown"]);
    expect(waitingStep(run)?.widget).toBe("price-summary");
    expect(run.results.quote).toMatchObject({ total: 35 });

    // They confirm: the order goes through and the run is checked.
    ({ run, events } = await go(answered(run, { confirmed: true }), using));
    expect(events.map((event) => event.type)).toEqual(["tool-started", "tool-finished", "said", "shown", "checked", "finished"]);
    expect(run.status).toBe("done");
    expect((run.results.order as OrderResult).booking).toMatchObject({ code: "K7QM2P", seat: seat.id });
    expect(run.checks).toEqual([
      { pass: true, label: `You asked for a window seat. ${seat.id} is one.` },
      { pass: true, label: `Your booking now shows seat ${seat.id}.` },
      { pass: true, label: "Charged AED 35, the amount you agreed to." },
    ]);

    expect(itemsOf(run).map((item) => (item.kind === "widget" ? `${item.widget}:${item.state}` : item.kind))).toEqual([
      "say",
      "seat-map:answered",
      "say",
      "price-summary:answered",
      "say",
      "receipt:shown",
    ]);
    expect(seen.map((request) => `${request.method} ${request.path}`)).toEqual([
      `GET /api/flights/${london.flight.id}/seats`,
      "POST /api/quotes",
      "POST /api/orders",
    ]);
    expect(seen[2].body).toMatchObject({ booking: { code: "K7QM2P" }, changes: [{ type: "seat", seat: seat.id }], expectedTotal: 35 });
  });

  it("says when the result is not what was asked for", async () => {
    const aisle = freeSeat(london, "aisle");
    let { run } = await go(startRun(plan([seatIntent])));
    ({ run } = await go(answered(run, { seat: aisle.id, kinds: aisle.kinds, price: aisle.price })));
    ({ run } = await go(answered(run, { confirmed: true })));
    expect(run.checks[0]).toEqual({ pass: false, label: `You asked for a window seat, and picked ${aisle.id}, which is an aisle seat.` });
    expect(run.checks.slice(1).every((check) => check.pass)).toBe(true);
  });

  it("pauses at the question when the trip is not clear, and carries on from the answer", async () => {
    let { run } = await go(startRun(plan([{ journey: "seat", wish: "aisle" }])));
    expect(waitingStep(run)?.widget).toBe("trip-chooser");
    ({ run } = await go(answered(run, { booking: trip("IST") } as unknown as Json)));
    expect(waitingStep(run)?.widget).toBe("seat-map");
    expect(itemsOf(run).map((item) => (item.kind === "say" ? item.text : item.kind))).toEqual([
      "Which trip is this for?",
      "widget",
      "Here is the cabin on JN 261 to Istanbul. Free aisle seats are marked.",
      "widget",
    ]);
  });

  it("shows what it is doing while a call is under way", async () => {
    const states: RunState[] = [];
    let state = startRun(plan([seatIntent]));
    await advance(state, deps(), (event) => {
      state = reduceRun(state, event);
      states.push(state);
    });
    const during = states[1]; // after "tool-started"
    expect(itemsOf(during)).toEqual([{ kind: "working", stepId: "seats", label: "Get the seat map" }]);
  });

  it("stops with the airline's own words when the API refuses, and can be tried again", async () => {
    const taken = takenSeat(london);
    let { run } = await go(startRun(plan([seatIntent])));
    const stuck = await go(answered(run, { seat: taken.id, kinds: taken.kinds, price: taken.price }));
    run = stuck.run;
    expect(run.status).toBe("failed");
    expect(run.failure).toEqual({ stepId: "quote", code: "seat_taken", message: `Seat ${taken.id} has just been taken. Choose another.` });
    expect(stuck.events.at(-1)).toMatchObject({ type: "failed", call: { tool: "quote", status: 409 } });
    expect(itemsOf(run).at(-1)).toMatchObject({ kind: "failed", failure: { code: "seat_taken" } });

    const again = await go(run);
    expect(again.events.map((event) => event.type)).toEqual(["resumed", "tool-started", "failed"]);
  });

  it("recovers when a call fails once and then works", async () => {
    let calls = 0;
    const flaky = deps({ intercept: (path) => (path.endsWith("/seats") && (calls += 1) === 1 ? Response.json({ nope: true }, { status: 503 }) : null) });
    let { run } = await go(startRun(plan([seatIntent])), flaky);
    expect(run.failure).toMatchObject({ code: "server", message: "The airline answered 503. Try again in a moment." });
    ({ run } = await go(run, flaky));
    expect(run.status).toBe("waiting");
    expect(run.failure).toBeUndefined();
  });

  it("reports a network failure and an unexpected answer in plain words", async () => {
    const offline = await go(startRun(plan([seatIntent])), {
      ...deps(),
      fetch: async () => {
        throw new TypeError("Failed to fetch");
      },
    });
    expect(offline.run.failure).toMatchObject({ code: "network" });

    const garbled = await go(startRun(plan([seatIntent])), deps({ intercept: () => Response.json({ rows: "none" }) }));
    expect(garbled.run.failure).toMatchObject({ code: "bad_answer" });
  });

  it("stops when it is told to, before and during a call", async () => {
    const before = new AbortController();
    before.abort();
    expect((await go(startRun(plan([seatIntent])), deps({}, before.signal))).events.map((event) => event.type)).toEqual(["stopped"]);

    const during = new AbortController();
    const stopped = await go(
      startRun(plan([seatIntent])),
      deps(
        {
          intercept: () => {
            during.abort();
            throw new DOMException("The request was stopped.", "AbortError");
          },
        },
        during.signal,
      ),
    );
    expect(stopped.run.status).toBe("stopped");
    expect(stopped.events.at(-1)).toEqual({ type: "stopped" });
  });

  it("refuses a plan that points at nothing, or shows what a component cannot show", async () => {
    const dangling: Plan = { steps: [{ id: "a", kind: "say", text: "Seat {{seat.seat}}" }], expectations: [] };
    expect((await go(startRun(dangling))).run.failure).toMatchObject({ code: "bad_plan", message: 'The plan refers to "seat.seat", which nothing has produced.' });

    const wrong: Plan = { steps: [{ id: "a", kind: "show", widget: "receipt", props: { receipt: 5 }, waits: false, label: "x" }], expectations: [] };
    expect((await go(startRun(wrong))).run.failure).toMatchObject({ code: "bad_plan" });
  });

  it("does nothing to a run that is waiting, done or stopped", async () => {
    const { run } = await go(startRun(plan([seatIntent])));
    expect((await go(run)).events).toEqual([]);
    const { run: done } = await go(startRun(plan([{ journey: "trips" }])));
    expect(done.status).toBe("done");
    expect((await go(done)).events).toEqual([]);
  });

  it("only takes an answer the waiting component can give", async () => {
    const { run } = await go(startRun(plan([seatIntent])));
    expect(answerEvent(run, "seat", { seat: "4F", kinds: ["window"], price: 35 })).toMatchObject({ type: "answered" });
    expect(answerEvent(run, "pay", { confirmed: true })).toBeNull(); // not the step that is waiting
    expect(answerEvent(run, "seat", { seat: 4 })).toBeNull(); // not a seat answer
    expect(answerEvent(startRun(plan([seatIntent])), "seat", { seat: "4F", kinds: ["window"], price: 35 })).toBeNull(); // not waiting yet
  });
});

describe("changing a journey under way", () => {
  const withAisle: Intent = { ...seatIntent, wish: "aisle" } as Intent;

  it("changes nothing when the new plan is the same", async () => {
    const { run } = await go(startRun(plan([seatIntent])));
    expect(replan(run, plan([seatIntent]))).toEqual({ run, changedAt: null });
  });

  it("leaves everything done alone when the change lies ahead", async () => {
    const { run } = await go(startRun(plan([{ journey: "seat", wish: "window" }])));
    expect(waitingStep(run)?.widget).toBe("trip-chooser");
    const changed = replan(run, plan([{ journey: "seat", wish: "aisle" }]));
    expect(changed.changedAt).toBe(3); // the line above the seat map
    expect(changed.run).toMatchObject({ at: run.at, status: "waiting", results: run.results });
    expect(changed.run.steps[4]).toMatchObject({ props: { wish: "aisle" } });
  });

  it("winds back to the first step that differs, keeping what came before", async () => {
    const seat = freeSeat(london, "window");
    let { run } = await go(startRun(plan([seatIntent])));
    ({ run } = await go(answered(run, { seat: seat.id, kinds: seat.kinds, price: seat.price })));
    expect(waitingStep(run)?.widget).toBe("price-summary");

    const changed = replan(run, plan([withAisle]));
    expect(changed.changedAt).toBe(2);
    expect(changed.run).toMatchObject({ at: 2, status: "running", checks: [] });
    expect(Object.keys(changed.run.results)).toEqual(["trip", "seats"]);

    // Carrying on shows the seat map again, now for an aisle seat, without asking the API twice.
    const seen: Seen = [];
    const { run: after } = await go(changed.run, deps({ seen }));
    expect(seen).toEqual([]);
    expect(waitingStep(after)?.widget).toBe("seat-map");
    expect(itemsOf(after)[0]).toMatchObject({ text: "Here is the cabin on JN 203 to London. Free aisle seats are marked." });
    expect(after.expectations[0]).toEqual({ kind: "seat-kind", wish: "aisle", seatStep: "seat" });
  });
});

describe("calling the API", () => {
  it("refuses arguments the tool cannot use, before calling anything", async () => {
    const seen: Seen = [];
    await expect(callTool("seatMap", { flight: 3 }, deps({ seen }))).rejects.toMatchObject({ failure: { code: "bad_plan" } });
    expect(seen).toEqual([]);
  });

  it("times the call and passes on the airline's refusal", async () => {
    const { call, result } = await callTool("seatMap", { flightId: london.flight.id }, deps());
    expect(call).toEqual({ tool: "seatMap", method: "GET", url: `/api/flights/${london.flight.id}/seats`, status: 200, ms: 5 });
    expect(result).toMatchObject({ flightId: london.flight.id });

    const refused = await callTool("seatMap", { flightId: "JN999_2026-10-08" }, deps()).catch((problem: unknown) => problem);
    expect(refused).toBeInstanceOf(ToolError);
    expect(refused).toMatchObject({ failure: { code: "no_such_flight", message: "There is no flight JN999_2026-10-08." }, call: { status: 404 } });
  });
});
