import { describe, expect, it } from "vitest";
import { exportTurn, ENVELOPE_FORMAT, ENVELOPE_VERSION } from "@/agent/export";
import { NOW, TODAY, apiFetch, freeSeat, memoryStorage, trip } from "@/test/api";
import { load, save } from "./persist";
import { makeStore } from "./store";
import { ask, start } from "./thunks";

// Each thing that happens in a journey is noted with the time it happened,
// so the journey can be laid out on a timeline afterwards.

function setup() {
  let tick = 0;
  const storage = memoryStorage();
  const store = makeStore({
    storage,
    fetch: apiFetch({}),
    // Each look at the clock is a few milliseconds after the last.
    now: () => new Date(NOW.getTime() + (tick += 7)),
    clock: () => (tick += 3),
    controllers: new Map(),
  });
  store.dispatch(start());
  const last = () => store.getState().conversation.turns.at(-1)!;
  return { store, storage, last };
}

const london = trip("LHR");

describe("the log of a turn", () => {
  it("notes the time of each thing that happens, in order", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("a window seat on my London flight"));

    const turn = last();
    expect(turn.log.map((entry) => [entry.type, entry.stepId])).toEqual([
      ["set", "trip"],
      ["tool-started", "seats"],
      ["tool-finished", "seats"],
      ["said", "seat-lead"],
      ["shown", "seat"],
    ]);
    const times = turn.log.map((entry) => entry.at);
    expect(times).toEqual([...times].sort((a, b) => a - b));
    expect(new Set(times).size).toBe(times.length);
    // The turn began before the first thing in it happened.
    expect(Date.parse(turn.startedAt!)).toBeLessThan(times[0]);
  });

  it("notes the traveller's words said partway, and the journey being left", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("a window seat on my London flight"));
    const before = last().log.length;
    await store.dispatch(ask("never mind"));

    const added = last().log.slice(before).map((entry) => entry.type);
    expect(added).toEqual(["marked", "closed"]);
    expect(last().run?.status).toBe("stopped");
  });

  it("keeps the log and the start time through a save and a load", async () => {
    const { store, storage, last } = setup();
    await store.dispatch(ask("a window seat on my London flight"));
    const { account } = store.getState().account;
    save(storage, { account: account!, turns: store.getState().conversation.turns });

    const [loaded] = load(storage, TODAY).turns;
    expect(loaded.startedAt).toBe(last().startedAt);
    expect(loaded.log).toEqual(last().log);
  });

  it("reads a turn saved before the log was kept as having none", () => {
    const { store, storage } = setup();
    const { account } = store.getState().account;
    save(storage, { account: account!, turns: [] });
    const saved = JSON.parse(storage.getItem("sayso:state")!);
    const old = {
      id: "turn-old",
      words: "show my trips",
      understanding: { kind: "request", intents: [] },
      brain: "rules",
      model: null,
      understoodMs: 1,
      intents: [],
      run: null,
      reply: "A reply",
      replyBy: null,
      streaming: false,
      marks: [],
      calls: [],
      closing: null,
    };
    storage.setItem("sayso:state", JSON.stringify({ ...saved, turns: [old] }));
    expect(load(storage, TODAY).turns[0]).toMatchObject({ id: "turn-old", startedAt: null, log: [] });
  });
});

describe("exporting a turn", () => {
  async function wholeJourney() {
    const { store, last } = setup();
    const seat = freeSeat(london, "window");
    await store.dispatch(ask("give me a window seat"));
    await store.dispatch(ask("the London one"));
    await store.dispatch(ask(seat.id));
    await store.dispatch(ask("yes"));
    return { turn: last(), seat };
  }

  it("writes out a whole journey: the words, the plan, each call, the answers, the checks and the times", async () => {
    const { turn, seat } = await wholeJourney();
    const { format, version, app, data } = exportTurn(turn, "2026-10-06T10:31:00.000Z");

    expect([format, version, app]).toEqual([ENVELOPE_FORMAT, ENVELOPE_VERSION, "sayso"]);
    expect(data).toMatchObject({ id: turn.id, words: "give me a window seat", brain: "rules", model: null, status: "done", failure: null, closing: null });
    expect(data.startedAt).toBe(turn.startedAt);
    expect(data.exportedAt).toBe("2026-10-06T10:31:00.000Z");
    expect(data.intents.map((intent) => intent.journey)).toEqual(["Choose a seat"]);

    expect(data.calls.map((call) => [call.tool, call.method, call.status])).toEqual([
      ["seatMap", "GET", 200],
      ["quote", "POST", 200],
      ["order", "POST", 200],
    ]);
    expect(data.calls[0].url).toBe(`/api/flights/${london.flight.id}/seats`);
    expect(data.calls[0].result).not.toBeNull();

    // The components that waited carry what the traveller answered; the lines say what was said.
    const shown = data.steps.filter((step) => step.kind === "show" && step.waits);
    expect(shown.map((step) => step.widget)).toEqual(["trip-chooser", "seat-map", "price-summary"]);
    expect(shown[1].answer).toMatchObject({ seat: seat.id, kinds: ["window"] });
    expect(data.steps.filter((step) => step.kind === "say").every((step) => typeof step.text === "string")).toBe(true);

    expect(data.marks.map((mark) => mark.words)).toEqual(["the London one", seat.id, "yes"]);
    expect(data.checks.every((check) => check.pass)).toBe(true);
    expect(data.log.length).toBe(turn.log.length);
    expect(data.log.at(-1)?.type).toBe("finished");
  });

  it("is plain JSON, so it survives being sent or saved as a file", async () => {
    const { turn } = await wholeJourney();
    const envelope = exportTurn(turn, "2026-10-06T10:31:00.000Z");
    expect(JSON.parse(JSON.stringify(envelope))).toEqual(envelope);
  });

  it("writes out a turn that led to no run", async () => {
    const { store, last } = setup();
    await store.dispatch(ask("hello"));
    const { data } = exportTurn(last(), "2026-10-06T10:31:00.000Z");
    expect(data).toMatchObject({ understanding: "chat", status: null, steps: [], calls: [], log: [], reply: "Hello. Say what you need and I will bring up the right screen for it." });
  });

  it("leaves out the contents of a result too big to carry", async () => {
    const { turn } = await wholeJourney();
    const big = structuredClone(turn);
    big.calls[0].result = { rows: "x".repeat(30_000) };
    expect(exportTurn(big, "2026-10-06T10:31:00.000Z").data.calls[0].result).toEqual({ truncated: true, characters: expect.any(Number) });
  });
});
