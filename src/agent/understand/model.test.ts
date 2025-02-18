import { describe, expect, it } from "vitest";
import { TODAY, account, trip } from "@/test/api";
import { FACTS, talkPrompt } from "../talk";
import type { Context, Json } from "../types";
import { readReply, systemPrompt, understandByModel, type Ask } from "./model";

// TODAY is Tuesday 6 October 2026.

const context: Context = { today: TODAY, account: account() };
const london = trip("LHR");
const flights = [
  { ...london.flight, id: "a", number: "JN 201", departs: "08:30", price: 1420 },
  { ...london.flight, id: "b", number: "JN 203", departs: "12:40", price: 1260 },
];
const atFlights: Context = {
  ...context,
  active: { intents: [{ journey: "change-flight", trip: { place: "LHR" } }], widget: "flight-list", props: { flights, current: flights[1] } as unknown as Json },
};
const read = (reply: unknown, within: Context = context) => readReply(typeof reply === "string" ? reply : JSON.stringify(reply), within);

describe("what the model is told", () => {
  const prompt = systemPrompt(context);

  it("includes today, a calendar and what next week means, so it has no dates to work out", () => {
    expect(prompt).toContain("TODAY: Tuesday 2026-10-06");
    expect(prompt).toContain("Tue 2026-10-06, Wed 2026-10-07, Thu 2026-10-08");
    expect(prompt).toContain('"Next week" is 2026-10-12 to 2026-10-18.');
  });

  it("lists the traveller's trips with their codes, and the places the airline flies", () => {
    expect(prompt).toContain("K7QM2P: JN 203, Dubai to London, Thu 2026-10-08 12:40, seat 17E, 1 checked bag, not checked in");
    expect(prompt).toContain("R3XD8N: JN 261, Dubai to Istanbul");
    expect(prompt).toContain("no seat chosen, 0 checked bags");
    expect(prompt).toContain("Paris (CDG)");
  });

  it("offers picking and amending only when a journey is under way, with what is on screen", () => {
    expect(prompt).not.toContain('"kind":"pick"');
    const under = systemPrompt(atFlights);
    expect(under).toContain('A JOURNEY IS UNDER WAY: [{"journey":"change-flight","trip":{"place":"LHR"}}]');
    expect(under).toContain("JN 201: leaves 08:30, lands");
    expect(under).toContain('{"kind":"pick","value":"..."}');
  });

  it("never holds the visitor's key or card", () => {
    expect(prompt).not.toContain("4242");
    expect(prompt).not.toContain("Visa");
  });
});

describe("checking the model's reply", () => {
  it("accepts a request, turning a booking code into a trip", () => {
    expect(read({ kind: "request", intents: [{ journey: "seat", trip: "K7QM2P", wish: "window" }, { journey: "bags", add: 2 }] })).toEqual({
      ok: true,
      understanding: { kind: "request", intents: [{ journey: "seat", trip: { code: "K7QM2P" }, wish: "window" }, { journey: "bags", add: 2 }] },
    });
    expect(read({ kind: "request", intents: [{ journey: "book", to: "CDG", when: { from: "2026-10-16", to: "2026-10-16" } }] })).toMatchObject({
      ok: true,
      understanding: { intents: [{ journey: "book", to: "CDG", when: { from: "2026-10-16", to: "2026-10-16" } }] },
    });
    expect(read({ kind: "request", intents: [{ journey: "change-flight", when: { shiftDays: -1 } }] })).toMatchObject({ ok: true });
  });

  it("reads JSON inside a code fence, and treats empty fields as left out", () => {
    const fenced = '```json\n{"kind":"request","intents":[{"journey":"seat","trip":null,"wish":"aisle","seat":""}]}\n```';
    expect(read(fenced)).toEqual({ ok: true, understanding: { kind: "request", intents: [{ journey: "seat", wish: "aisle" }] } });
  });

  it("passes talk, unknown and abandon through", () => {
    expect(read({ kind: "talk" })).toEqual({ ok: true, understanding: { kind: "talk" } });
    expect(read({ kind: "unknown" })).toEqual({ ok: true, understanding: { kind: "unknown" } });
    expect(read({ kind: "abandon" }, atFlights)).toEqual({ ok: true, understanding: { kind: "abandon" } });
  });

  it("refuses what is not JSON, or not in the expected shape, and says why", () => {
    expect(read("Sure! I can help with that.")).toEqual({ ok: false, problem: "The reply was not a JSON object." });
    expect(read({ kind: "request", intents: [{ journey: "upgrade" }] })).toMatchObject({ ok: false });
    expect(read({ kind: "request", intents: [] })).toMatchObject({ ok: false });
    expect(read({ kind: "request", intents: [{ journey: "seat", wish: "throne" }] })).toMatchObject({ ok: false });
    expect(read({ kind: "request", intents: [{ journey: "bags", add: 40 }] })).toMatchObject({ ok: false });
    expect(read({ kind: "request", intents: [{ journey: "book", when: { from: "2026-10-20", to: "2026-10-10" } }] })).toMatchObject({ ok: false });
    expect(read({ kind: "request", intents: [{ journey: "book", when: { from: "next friday", to: "next friday" } }] })).toMatchObject({ ok: false });
  });

  it("refuses a booking the traveller does not have, and a place the airline does not fly", () => {
    expect(read({ kind: "request", intents: [{ journey: "cancel", trip: "ZZZZZZ" }] })).toEqual({
      ok: false,
      problem: 'There is no booking "ZZZZZZ". Use a code from the list of trips, or leave "trip" out.',
    });
    expect(read({ kind: "request", intents: [{ journey: "book", to: "SYD" }] })).toEqual({
      ok: false,
      problem: 'The airline does not fly to "SYD". Use an airport from the list.',
    });
  });

  it("only lets a journey be picked from, changed or left when one is under way", () => {
    expect(read({ kind: "pick", value: "JN 201" })).toEqual({ ok: false, problem: '"pick" is only for when a journey is under way, and none is.' });
    expect(read({ kind: "amend", intents: [{ journey: "seat" }] })).toMatchObject({ ok: false });
    expect(read({ kind: "amend", intents: [{ journey: "change-flight", when: { from: "2026-10-20", to: "2026-10-20" } }] }, atFlights)).toMatchObject({
      ok: true,
      understanding: { kind: "amend" },
    });
  });

  it("turns a pick into the answer the component on screen would give", () => {
    expect(read({ kind: "pick", value: "jn201" }, atFlights)).toEqual({ ok: true, understanding: { kind: "answer", answer: { flight: flights[0] } } });
    // The flight they are already on is not an option.
    expect(read({ kind: "pick", value: "JN 203" }, atFlights)).toEqual({ ok: false, problem: '"JN 203" is not one of the options on screen.' });

    const at = (widget: NonNullable<Context["active"]>["widget"], props: unknown): Context => ({ ...context, active: { intents: [], widget, props: props as Json } });
    expect(read({ kind: "pick", value: "R3XD8N" }, at("trip-chooser", { bookings: account().bookings }))).toMatchObject({
      understanding: { kind: "answer", answer: { booking: { code: "R3XD8N" } } },
    });
    expect(read({ kind: "pick", value: "2026-10-13" }, at("date-strip", { days: [{ date: "2026-10-13", price: 1 }] }))).toMatchObject({
      understanding: { answer: { date: "2026-10-13", label: "Tue 13 Oct" } },
    });
    expect(read({ kind: "pick", value: 2 }, at("bag-stepper", { current: 1, max: 5 }))).toMatchObject({ understanding: { answer: { count: 3, added: 2 } } });
    expect(read({ kind: "pick", value: 9 }, at("bag-stepper", { current: 1, max: 5 }))).toMatchObject({ ok: false });
    expect(read({ kind: "pick", value: "yes" }, at("refund", {}))).toMatchObject({ understanding: { answer: { confirmed: true } } });
    expect(read({ kind: "pick", value: "14A" }, at("seat-map", {}))).toMatchObject({ ok: false });
  });
});

describe("asking the model", () => {
  /** A model that gives each prepared reply in turn, keeping what it was sent. */
  function scripted(...replies: string[]): { ask: Ask; sent: Parameters<Ask>[0][] } {
    const sent: Parameters<Ask>[0][] = [];
    return {
      sent,
      ask: async (messages) => {
        sent.push(messages);
        return replies.shift() ?? "";
      },
    };
  }

  it("returns what a good reply means, in one call", async () => {
    const { ask, sent } = scripted('{"kind":"request","intents":[{"journey":"seat","wish":"window","trip":"K7QM2P"}]}');
    expect(await understandByModel("I'd rather sit by the window on the way to London", context, ask)).toEqual({
      kind: "request",
      intents: [{ journey: "seat", wish: "window", trip: { code: "K7QM2P" } }],
    });
    expect(sent).toHaveLength(1);
    expect(sent[0].map((message) => message.role)).toEqual(["system", "user"]);
    expect(sent[0][1].content).toBe("I'd rather sit by the window on the way to London");
  });

  it("sends a reply that does not fit back once, saying what was wrong", async () => {
    const { ask, sent } = scripted('{"kind":"request","intents":[{"journey":"cancel","trip":"ABC123"}]}', '{"kind":"request","intents":[{"journey":"cancel","trip":"R3XD8N"}]}');
    expect(await understandByModel("drop the Istanbul thing", context, ask)).toEqual({ kind: "request", intents: [{ journey: "cancel", trip: { code: "R3XD8N" } }] });
    expect(sent).toHaveLength(2);
    expect(sent[1].map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(sent[1][3].content).toBe(
      'That cannot be used. There is no booking "ABC123". Use a code from the list of trips, or leave "trip" out. Reply again with one JSON object only.',
    );
  });

  it("gives up after one repair", async () => {
    const { ask, sent } = scripted("I think you want a seat.", "Still not JSON.");
    expect(await understandByModel("hmm", context, ask)).toBeNull();
    expect(sent).toHaveLength(2);
  });
});

describe("answering in words", () => {
  it("takes its facts from the same numbers the pricing uses", () => {
    const all = Object.values(FACTS).join(" ");
    expect(all).toContain("costs AED 120");
    expect(all).toContain("change fee of AED 150");
    expect(all).toContain("less a fee of AED 200");
    expect(all).toContain("AED 35 for a window or aisle seat, AED 90 at the front, AED 160 for extra legroom");
  });

  it("tells the model to answer from the facts alone, and names the traveller's trips", () => {
    const prompt = talkPrompt(context);
    expect(prompt).toContain("Use only the facts below.");
    expect(prompt).toContain("JN 203 to London on Thu 8 Oct at 12:40");
    expect(prompt).not.toContain("4242");
  });
});
