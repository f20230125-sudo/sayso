import { describe, expect, it } from "vitest";
import { NOT_UNDERSTOOD } from "@/agent/replies";
import { itemsOf, waitingStep } from "@/agent/run";
import { addDays } from "@/airline/dates";
import { NOW, TODAY, apiFetch, freeSeat, memoryStorage, takenSeat, trip, type Seen } from "@/test/api";
import { STATE_KEY, load, save } from "./persist";
import { SAVE_DELAY_MS, makeStore } from "./store";
import { answer, ask, drive, start, startOver, stop } from "./thunks";

type Setup = { storage?: ReturnType<typeof memoryStorage>; seen?: Seen; intercept?: NonNullable<Parameters<typeof apiFetch>[0]>["intercept"] };

function setup({ storage = memoryStorage(), seen, intercept }: Setup = {}) {
  let tick = 0;
  const store = makeStore({
    storage,
    fetch: apiFetch({ seen, intercept }),
    now: () => NOW,
    clock: () => (tick += 3),
    controllers: new Map(),
  });
  store.dispatch(start());
  const turns = () => store.getState().conversation.turns;
  const last = () => turns().at(-1)!;
  const booking = (code: string) => store.getState().account.account!.bookings.find((entry) => entry.code === code)!;
  return { store, storage, turns, last, booking };
}

const london = trip("LHR");
const settle = () => new Promise((resolve) => setTimeout(resolve, SAVE_DELAY_MS + 60));

describe("starting", () => {
  it("starts a fresh demo when the browser remembers nothing", () => {
    const { store, turns } = setup();
    expect(store.getState().account.account).toMatchObject({ seededOn: TODAY, traveller: { name: "Noor Haddad" } });
    expect(turns()).toEqual([]);
  });

  it("starts fresh when what the browser remembers is broken or from another version", () => {
    expect(load(memoryStorage({ [STATE_KEY]: "{not json" }), TODAY).turns).toEqual([]);
    expect(load(memoryStorage({ [STATE_KEY]: JSON.stringify({ version: 0, account: {}, turns: [] }) }), TODAY).account.seededOn).toBe(TODAY);
    expect(load(null, TODAY).account.bookings).toHaveLength(3);
  });

  it("starts fresh on a later day, when yesterday's trips have gone", () => {
    const storage = memoryStorage();
    const kept = load(storage, TODAY);
    kept.account.bookings[0].bags = 4;
    save(storage, kept);
    expect(load(storage, TODAY).account.bookings[0].bags).toBe(4);
    expect(load(storage, addDays(TODAY, 1))).toMatchObject({ account: { seededOn: addDays(TODAY, 1) }, turns: [] });
  });
});

describe("asking", () => {
  it("answers a request with a run", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("  Show my trips  "));
    expect(last()).toMatchObject({ words: "Show my trips", brain: "rules", intents: [{ journey: "trips" }], run: { status: "done" }, reply: null });
  });

  it("answers small talk and what it does not understand with a line, and no run", async () => {
    const { store, last, turns } = setup();
    await store.dispatch(ask("hello"));
    expect(last()).toMatchObject({ run: null, reply: "Hello. Say what you need and I will bring up the right screen for it." });
    await store.dispatch(ask("sing me a song"));
    expect(last()).toMatchObject({ run: null, reply: NOT_UNDERSTOOD });
    await store.dispatch(ask("yes"));
    expect(last().reply).toBe(NOT_UNDERSTOOD);
    await store.dispatch(ask("   "));
    expect(turns()).toHaveLength(3);
  });

  it("carries a whole journey out by typing alone", async () => {
    const seen: Seen = [];
    const { store, last, turns, booking } = setup({ seen });
    const seat = freeSeat(london, "window");

    await store.dispatch(ask("give me a window seat"));
    expect(waitingStep(last().run)?.widget).toBe("trip-chooser");

    await store.dispatch(ask("the London one"));
    expect(waitingStep(last().run)?.widget).toBe("seat-map");

    await store.dispatch(ask(seat.id));
    expect(waitingStep(last().run)?.widget).toBe("price-summary");

    await store.dispatch(ask("yes"));
    expect(turns()).toHaveLength(1);
    expect(last().run).toMatchObject({ status: "done", checks: [{ pass: true }, { pass: true }, { pass: true }] });
    expect(last().marks.map((mark) => mark.words)).toEqual(["the London one", seat.id, "yes"]);
    expect(last().calls.map((record) => `${record.call.tool} ${record.call.status}`)).toEqual(["seatMap 200", "quote 200", "order 200"]);

    // The booking in the account is the one the order sent back, and the payment is noted.
    expect(booking("K7QM2P")).toMatchObject({ seat: seat.id, paid: london.paid + 35 });
    expect(store.getState().account.account!.payments[0]).toMatchObject({ amount: 35, bookingCode: "K7QM2P", date: TODAY, what: `Seat ${seat.id}, window` });
    expect(seen.map((request) => request.path)).toEqual([`/api/flights/${london.flight.id}/seats`, "/api/quotes", "/api/orders"]);
  });

  it("carries the same journey out by touching the components", async () => {
    const { store, last, booking } = setup();
    const seat = freeSeat(london, "aisle");
    await store.dispatch(ask("an aisle seat on my London flight"));
    await store.dispatch(answer(last().id, "seat", { seat: seat.id, kinds: seat.kinds, price: seat.price }));
    await store.dispatch(answer(last().id, "pay", { confirmed: true }));
    expect(last().run?.status).toBe("done");
    expect(last().marks).toEqual([]);
    expect(booking("K7QM2P").seat).toBe(seat.id);
  });

  it("ignores an answer for a step that is not the one waiting", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("an aisle seat on my London flight"));
    await store.dispatch(answer(last().id, "pay", { confirmed: true }));
    await store.dispatch(answer("no-such-turn", "seat", { seat: "4F", kinds: ["window"], price: 35 }));
    expect(waitingStep(last().run)?.widget).toBe("seat-map");
  });

  it("uses the trip the conversation was about when the next request names none", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("a window seat on my Istanbul flight"));
    await store.dispatch(ask("never mind"));
    await store.dispatch(ask("actually I want more legroom"));
    expect(last().run?.steps[0]).toMatchObject({ kind: "set", value: { booking: { code: "R3XD8N" } } });
  });
});

describe("words said partway through a journey", () => {
  it("changes the journey in place: aisle instead of window", async () => {
    const seen: Seen = [];
    const { store, last, turns } = setup({ seen });
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask("aisle instead"));

    expect(turns()).toHaveLength(1);
    expect(last().intents).toEqual([{ journey: "seat", trip: { place: "LHR" }, wish: "aisle" }]);
    expect(last().marks).toEqual([{ words: "aisle instead", beforeStep: "seat-lead" }]);
    expect(waitingStep(last().run)).toMatchObject({ widget: "seat-map", props: { wish: "aisle" } });
    expect(last().run?.results["seat-lead"]).toBe("Here is the cabin on JN 203 to London. Free aisle seats are marked.");
    // The seat map already fetched is used again.
    expect(seen).toHaveLength(1);
  });

  it("winds back when the change is to something already chosen", async () => {
    const { store, last } = setup();
    const seat = freeSeat(london, "window");
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask(seat.id));
    expect(waitingStep(last().run)?.widget).toBe("price-summary");

    await store.dispatch(ask("make it an aisle seat"));
    expect(waitingStep(last().run)).toMatchObject({ widget: "seat-map", props: { wish: "aisle" } });
    expect(last().run?.results.seat).toBeUndefined();
    expect(last().run?.results.quote).toBeUndefined();
  });

  it("says so when the change is no change", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask("window seat"));
    expect(last().marks).toEqual([{ words: "window seat", beforeStep: null, reply: "That is already how it is set." }]);
    expect(waitingStep(last().run)?.widget).toBe("seat-map");
  });

  it("explains a typed seat that cannot be had, and keeps waiting", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask(takenSeat(london).id));
    expect(last().marks.at(-1)).toMatchObject({ reply: `Seat ${takenSeat(london).id} is taken. Pick another.` });
    await store.dispatch(ask("purple monkey"));
    expect(last().marks.at(-1)).toMatchObject({ reply: 'I did not understand that. Choose on the screen above, or say "never mind" to leave it.' });
    await store.dispatch(ask("thanks"));
    expect(last().marks.at(-1)).toMatchObject({ reply: "You are welcome." });
    expect(waitingStep(last().run)?.widget).toBe("seat-map");
  });

  it("leaves the journey on never mind, changing nothing", async () => {
    const { store, last, booking } = setup();
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask("never mind"));
    expect(last()).toMatchObject({ run: { status: "stopped" }, closing: "Left unfinished. Nothing was changed.", marks: [{ words: "never mind" }] });
    // The seat map that was left stays on the page, to show what was left.
    expect(itemsOf(last().run!).at(-1)).toMatchObject({ kind: "widget", widget: "seat-map", state: "active" });
    expect(booking("K7QM2P").seat).toBe(london.seat);
  });

  it("leaves the journey when something else is asked for", async () => {
    const { store, turns } = setup();
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask("show my trips"));
    expect(turns()).toHaveLength(2);
    expect(turns()[0]).toMatchObject({ run: { status: "stopped" }, closing: "Left unfinished. Nothing was changed." });
    expect(turns()[1].run?.status).toBe("done");
  });
});

describe("when things go wrong", () => {
  it("keeps a failed turn so it can be tried again", async () => {
    let fail = true;
    const { store, last } = setup({ intercept: (path) => (fail && path.endsWith("/seats") ? Response.json({}, { status: 500 }) : null) });
    await store.dispatch(ask("a window seat on my London flight"));
    expect(last().run).toMatchObject({ status: "failed", failure: { stepId: "seats", code: "server" } });

    fail = false;
    await store.dispatch(drive(last().id));
    expect(waitingStep(last().run)?.widget).toBe("seat-map");
  });

  it("records a refused call with the airline's reason", async () => {
    const { store, last, booking } = setup();
    const taken = takenSeat(london);
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(answer(last().id, "seat", { seat: taken.id, kinds: taken.kinds, price: taken.price }));
    expect(last().run?.failure).toMatchObject({ code: "seat_taken" });
    expect(last().calls.at(-1)).toMatchObject({ call: { tool: "quote", status: 409 }, result: null, failure: { code: "seat_taken" } });
    expect(booking("K7QM2P").seat).toBe(london.seat);
  });

  it("stops a call that is under way, and ignores its answer when it comes", async () => {
    let release: (response: Response) => void = () => {};
    const { store, last } = setup({ intercept: (path) => (path.endsWith("/seats") ? new Promise<Response>((resolve) => (release = resolve)) : null) });
    const asking = store.dispatch(ask("a window seat on my London flight"));
    await Promise.resolve();
    expect(last().run?.status).toBe("running");

    store.dispatch(stop());
    expect(last()).toMatchObject({ run: { status: "stopped" }, closing: "Stopped. Nothing was changed." });

    release(Response.json({}));
    await asking;
    expect(last().run?.status).toBe("stopped");
  });
});

describe("remembering", () => {
  it("saves shortly after a change, and picks a waiting journey up after a reload", async () => {
    const storage = memoryStorage();
    const first = setup({ storage });
    await first.store.dispatch(ask("a window seat on my London flight"));
    await settle();
    expect(JSON.parse(storage.data.get(STATE_KEY)!)).toMatchObject({ version: 1, turns: [{ words: "a window seat on my London flight" }] });

    // A second store over the same storage is the page after a reload.
    const second = setup({ storage });
    expect(waitingStep(second.last().run)?.widget).toBe("seat-map");
    const seat = freeSeat(london, "window");
    await second.store.dispatch(ask(seat.id));
    await second.store.dispatch(ask("yes"));
    expect(second.booking("K7QM2P").seat).toBe(seat.id);

    await settle();
    expect(setup({ storage }).booking("K7QM2P").seat).toBe(seat.id);
  });

  it("marks a run that was mid-call when the page closed, so it can be tried again", async () => {
    const storage = memoryStorage();
    const first = setup({ storage, intercept: (path) => (path.endsWith("/seats") ? new Promise<Response>(() => {}) : null) });
    void first.store.dispatch(ask("a window seat on my London flight"));
    await settle();

    const second = setup({ storage });
    expect(second.last().run).toMatchObject({ status: "failed", failure: { stepId: "seats", code: "interrupted" } });
    await second.store.dispatch(drive(second.last().id));
    expect(waitingStep(second.last().run)?.widget).toBe("seat-map");
  });

  it("starts over on request: fresh trips, empty conversation, nothing kept", async () => {
    const storage = memoryStorage();
    const { store, turns, booking } = setup({ storage });
    const seat = freeSeat(london, "window");
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask(seat.id));
    await store.dispatch(ask("yes"));
    expect(booking("K7QM2P").seat).toBe(seat.id);

    store.dispatch(startOver());
    expect(turns()).toEqual([]);
    expect(booking("K7QM2P").seat).toBe(london.seat);
  });
});
