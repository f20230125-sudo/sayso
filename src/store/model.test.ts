import { describe, expect, it } from "vitest";
import { NOT_UNDERSTOOD } from "@/agent/replies";
import { waitingStep } from "@/agent/run";
import { AI_STORAGE_KEY, presetConfig } from "@/ai/settings";
import { NOW, apiFetch, memoryStorage, type Seen } from "@/test/api";
import { saveAiConfig } from "./settingsSlice";
import { makeStore } from "./store";
import { ask, isBusy, start, stop } from "./thunks";

// The desk with a model switched on. The provider is a stand-in: each test
// says what it replies. NOW is 10:30 on Tuesday 6 October 2026.

const MODEL = "gemini-3.5-flash-lite";
const json = (value: unknown) => Response.json({ choices: [{ message: { content: JSON.stringify(value) } }] });
const words = (...pieces: string[]) =>
  new Response(pieces.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`).join("") + "data: [DONE]\n\n");

type Reply = Response | Promise<Response> | (() => Response | Promise<Response>);

function setup(replies: Reply[] = [], { key = true } = {}) {
  const seen: Seen = [];
  let tick = 0;
  const storage = memoryStorage(key ? { [AI_STORAGE_KEY]: JSON.stringify(presetConfig("gemini", "k-secret")) } : {});
  const store = makeStore({
    storage,
    fetch: apiFetch({
      seen,
      intercept: (path) => {
        if (!path.endsWith("/chat/completions")) return null;
        const next = replies.shift();
        if (!next) throw new Error("The provider was asked more often than the test prepared for.");
        return typeof next === "function" ? next() : next;
      },
    }),
    now: () => NOW,
    clock: () => (tick += 400),
    controllers: new Map(),
  });
  store.dispatch(start());
  const turns = () => store.getState().conversation.turns;
  const last = () => turns().at(-1)!;
  const asked = () => seen.filter((request) => request.path.endsWith("/chat/completions"));
  return { store, storage, turns, last, asked };
}

describe("rules first, model second", () => {
  it("does not ask the model for what the rules can read", async () => {
    const { store, last, asked } = setup();
    await store.dispatch(ask("Show my trips"));
    expect(last()).toMatchObject({ brain: "rules", model: null, run: { status: "done" } });
    expect(asked()).toEqual([]);
  });

  it("asks the model for what the rules cannot read, and runs what it understood", async () => {
    const { store, last, asked } = setup([json({ kind: "request", intents: [{ journey: "seat", wish: "window", trip: "K7QM2P" }] })]);
    await store.dispatch(ask("I'd love to look out at the clouds on the way to London"));

    expect(last()).toMatchObject({ brain: "model", model: MODEL, intents: [{ journey: "seat", wish: "window", trip: { code: "K7QM2P" } }] });
    expect(last().understoodMs).toBeGreaterThan(0);
    expect(waitingStep(last().run)).toMatchObject({ widget: "seat-map", props: { wish: "window" } });

    // One call, as JSON, with the visitor's key, straight to the provider.
    expect(asked()).toHaveLength(1);
    expect(asked()[0].body).toMatchObject({ model: MODEL, response_format: { type: "json_object" } });
    expect(asked()[0].path).toBe("/v1beta/openai/chat/completions");
  });

  it("never asks the model when the visitor has given none", async () => {
    const { store, last, asked } = setup([], { key: false });
    await store.dispatch(ask("I'd love to look out at the clouds on the way to London"));
    expect(last()).toMatchObject({ brain: "rules", model: null, reply: NOT_UNDERSTOOD, run: null });
    expect(asked()).toEqual([]);
  });

  it("says it did not understand when the model does not either", async () => {
    const { store, last } = setup([json({ kind: "unknown" })]);
    await store.dispatch(ask("purple monkey dishwasher"));
    expect(last()).toMatchObject({ brain: "model", model: MODEL, reply: NOT_UNDERSTOOD, run: null });
  });

  it("gives the model one chance to repair a reply, then drops it", async () => {
    const good = setup(["nonsense", json({ kind: "request", intents: [{ journey: "trips" }] })].map((reply) => (typeof reply === "string" ? json(reply) : reply)));
    await good.store.dispatch(ask("what have I got coming up, travel-wise"));
    expect(good.asked()).toHaveLength(2);
    expect(good.last().run?.status).toBe("done");

    const bad = setup([json({ kind: "request", intents: [{ journey: "teleport" }] }), json({ kind: "request", intents: [{ journey: "cancel", trip: "NOPE00" }] })]);
    await bad.store.dispatch(ask("beam me to London"));
    expect(bad.asked()).toHaveLength(2);
    expect(bad.last()).toMatchObject({ brain: "model", reply: NOT_UNDERSTOOD, run: null });
  });

  it("says why when the model cannot be asked, and carries on without it", async () => {
    const { store, last } = setup([Response.json({ error: { message: "API key not valid." } }, { status: 400 })]);
    await store.dispatch(ask("purple monkey dishwasher"));
    expect(last()).toMatchObject({
      brain: "rules",
      model: null,
      reply: `${NOT_UNDERSTOOD} The model could not help: The model's service answered 400. API key not valid.`,
    });
    // The desk still works.
    await store.dispatch(ask("show my trips"));
    expect(last().run?.status).toBe("done");
  });
});

describe("a sentence with a not in it", () => {
  const cannotGo = "I can't go to Istanbul anymore";
  const askBack = 'I am not sure what you would like done about your Istanbul trip. You can say "cancel my Istanbul trip" or "move my Istanbul flight to Friday".';

  it("is asked back about when there is no model, and nothing is booked", async () => {
    const { store, last, asked } = setup([], { key: false });
    await store.dispatch(ask(cannotGo));
    expect(last()).toMatchObject({ brain: "rules", run: null, reply: askBack });
    expect(asked()).toEqual([]);
  });

  it("goes to the model when there is one, which can read what the rules will not guess at", async () => {
    const { store, last } = setup([json({ kind: "request", intents: [{ journey: "cancel", trip: "R3XD8N" }] })]);
    await store.dispatch(ask(cannotGo));
    expect(last()).toMatchObject({ brain: "model", intents: [{ journey: "cancel", trip: { code: "R3XD8N" } }] });
    expect(waitingStep(last().run)?.widget).toBe("refund");
  });

  it("is still asked back about when the model does not understand it either", async () => {
    const { store, last } = setup([json({ kind: "unknown" })]);
    await store.dispatch(ask(cannotGo));
    expect(last()).toMatchObject({ brain: "model", model: MODEL, run: null, reply: askBack });
  });

  it("keeps the question back when the model cannot be reached", async () => {
    const { store, last } = setup([Response.json({ error: "down" }, { status: 500 })]);
    await store.dispatch(ask(cannotGo));
    expect(last().reply).toBe(`${askBack} The model could not help: The model's service answered 500. down`);
  });
});

describe("while the model is being asked", () => {
  it("shows the words at once, and nothing else can be asked until it answers", async () => {
    let release: (response: Response) => void = () => {};
    const { store, turns } = setup([new Promise<Response>((resolve) => (release = resolve))]);
    const asking = store.dispatch(ask("something the rules cannot read"));
    await Promise.resolve();

    expect(store.getState().conversation.pending).toEqual({ words: "something the rules cannot read" });
    expect(isBusy(store.getState())).toBe(true);
    await store.dispatch(ask("show my trips"));
    expect(turns()).toEqual([]);

    release(json({ kind: "request", intents: [{ journey: "trips" }] }));
    await asking;
    expect(store.getState().conversation.pending).toBeNull();
    expect(turns()).toHaveLength(1);
    expect(isBusy(store.getState())).toBe(false);
  });

  it("can be stopped, leaving nothing behind", async () => {
    const { store, turns } = setup([() => new Promise<Response>(() => {})]);
    const asking = store.dispatch(ask("something the rules cannot read"));
    await Promise.resolve();
    store.dispatch(stop());
    await asking;
    expect(store.getState().conversation.pending).toBeNull();
    expect(turns()).toEqual([]);
  });
});

describe("a journey under way, with a model", () => {
  it("lets the model pick from what is on screen", async () => {
    const { store, last } = setup([json({ kind: "pick", value: "R3XD8N" })]);
    await store.dispatch(ask("give me a window seat"));
    expect(waitingStep(last().run)?.widget).toBe("trip-chooser");
    await store.dispatch(ask("the one where I see the Bosphorus"));
    expect(waitingStep(last().run)?.widget).toBe("seat-map");
    expect(last().run?.results.trip).toMatchObject({ booking: { code: "R3XD8N" } });
    expect(last().marks).toEqual([{ words: "the one where I see the Bosphorus", beforeStep: "seats" }]);
  });

  it("lets the model change the journey", async () => {
    const { store, last } = setup([json({ kind: "amend", intents: [{ journey: "seat", wish: "legroom" }] })]);
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask("on second thought my knees need the space"));
    expect(waitingStep(last().run)).toMatchObject({ widget: "seat-map", props: { wish: "legroom" } });
  });

  it("tells the model what is under way and what is on screen", async () => {
    const { store, asked } = setup([json({ kind: "unknown" })]);
    await store.dispatch(ask("move my london flight to next week"));
    await store.dispatch(ask("whichever is kindest to my wallet, friend"));
    const system = (asked()[0].body as { messages: { content: string }[] }).messages[0].content;
    expect(system).toContain("A JOURNEY IS UNDER WAY");
    expect(system).toContain("A row of days to choose from.");
    expect(system).toContain("Mon 2026-10-12 (from AED");
  });
});

describe("answering in words", () => {
  it("streams the answer into the turn, marked with the model that wrote it", async () => {
    const { store, last, asked } = setup([json({ kind: "talk" }), words("A checked bag ", "costs AED 120.")]);
    await store.dispatch(ask("am I allowed to bring my cello on board?"));

    expect(last()).toMatchObject({ run: null, reply: "A checked bag costs AED 120.", replyBy: MODEL, streaming: false, brain: "model" });
    expect(asked()).toHaveLength(2);
    expect(asked()[1].body).toMatchObject({ stream: true });
    const system = (asked()[1].body as { messages: { content: string }[] }).messages[0].content;
    expect(system).toContain("A checked bag is up to 23 kg and costs AED 120.");
  });

  it("answers a question asked partway through a journey under it, and keeps the journey", async () => {
    const { store, last, turns } = setup([json({ kind: "talk" }), words("Extra legroom is AED 160.")]);
    await store.dispatch(ask("a window seat on my London flight"));
    await store.dispatch(ask("is the food any good on board?"));
    expect(turns()).toHaveLength(1);
    expect(last().marks).toEqual([{ words: "is the food any good on board?", beforeStep: null, reply: "Extra legroom is AED 160.", by: MODEL }]);
    expect(last().streaming).toBe(false);
    expect(waitingStep(last().run)?.widget).toBe("seat-map");
  });

  it("replaces a reply that fails with the reason, and no longer claims a model wrote it", async () => {
    const { store, last } = setup([json({ kind: "talk" }), Response.json({ error: { message: "Quota used up." } }, { status: 403 })]);
    await store.dispatch(ask("what is your favourite airport?"));
    expect(last()).toMatchObject({ reply: "The model's service answered 403. Quota used up.", replyBy: null, streaming: false });
  });

  it("keeps what has arrived when the answer is stopped partway", async () => {
    let cancel = () => {};
    const slow = () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify({ choices: [{ delta: { content: "One cabin bag" } }] })}\n\n`));
            cancel = () => controller.error(new DOMException("stopped", "AbortError"));
          },
        }),
      );
    const { store, last } = setup([json({ kind: "talk" }), slow]);
    const asking = store.dispatch(ask("what can I carry on?"));
    for (let turns = 0; turns < 20 && last()?.reply !== "One cabin bag"; turns += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(last()).toMatchObject({ reply: "One cabin bag", streaming: true });

    store.dispatch(stop());
    cancel();
    await asking;
    expect(last()).toMatchObject({ reply: "One cabin bag", replyBy: MODEL, streaming: false });
  });
});

describe("the model settings", () => {
  it("are read at the start, and saved when changed", () => {
    const { store, storage } = setup();
    expect(store.getState().settings.ai).toMatchObject({ provider: "gemini", model: MODEL });
    store.dispatch(saveAiConfig(presetConfig("groq", "other")));
    expect(JSON.parse(storage.data.get(AI_STORAGE_KEY)!)).toMatchObject({ provider: "groq", apiKey: "other" });
  });

  it("never go into the saved conversation", async () => {
    const { store, storage } = setup([json({ kind: "request", intents: [{ journey: "trips" }] })]);
    await store.dispatch(ask("what have I got coming up, travel-wise"));
    await new Promise((resolve) => setTimeout(resolve, 320));
    expect(storage.data.get("sayso:state")).not.toContain("k-secret");
  });
});
