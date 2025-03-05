import { describe, expect, it } from "vitest";
import { NOW, TODAY, account, apiFetch } from "@/test/api";
import { examples } from "@/widgets/examples";
import { WIDGETS, WIDGET_TYPES, isWidgetType, summaryOf } from "@/widgets/specs";
import { catalog } from "./catalog";
import { describeIntent, describeStep, describeUnderstanding, progressOf } from "./describe";
import { planFor } from "./plan";
import { advance, reduceRun, startRun } from "./run";
import type { RunState } from "./types";

describe("saying what was understood", () => {
  it("names the journey and the details picked out of the words", () => {
    expect(describeIntent({ journey: "change-flight", trip: { place: "LHR" }, when: { from: "2026-10-12", to: "2026-10-18" } })).toEqual({
      journey: "Change a flight",
      details: [
        { name: "trip", value: "London" },
        { name: "when", value: "Mon 12 Oct to Sun 18 Oct" },
      ],
    });
    expect(describeIntent({ journey: "seat", trip: { code: "K7QM2P" }, wish: "legroom", seat: "10A" }).details).toEqual([
      { name: "trip", value: "booking K7QM2P" },
      { name: "seat wanted", value: "extra legroom" },
      { name: "seat named", value: "10A" },
    ]);
    expect(describeIntent({ journey: "book", from: "LHR", to: "DXB", when: { from: "2026-10-15", to: "2026-10-15" } }).details).toEqual([
      { name: "from", value: "London" },
      { name: "to", value: "Dubai" },
      { name: "when", value: "Thu 15 Oct" },
    ]);
    expect(describeIntent({ journey: "change-flight", trip: { weekday: 4, next: true }, when: { shiftDays: -1 } }).details).toEqual([
      { name: "trip", value: "the Thursday one, the next one" },
      { name: "when", value: "1 day earlier" },
    ]);
    expect(describeIntent({ journey: "bags", add: 2 }).details).toEqual([{ name: "bags to add", value: "2" }]);
    expect(describeIntent({ journey: "trips" })).toEqual({ journey: "See my trips", details: [] });
  });

  it("says what kind of thing the words were, when they led to no plan", () => {
    expect(describeUnderstanding({ kind: "chat", about: "hello" })).toBe("Small talk");
    expect(describeUnderstanding({ kind: "unknown" })).toBe("Not understood");
    expect(describeUnderstanding({ kind: "say", text: "x" })).toBe("A question the rules have a fact for");
  });
});

describe("saying where a plan has got to", () => {
  const plan = planFor([{ journey: "seat", trip: { place: "LHR" }, wish: "window" }], { today: TODAY, now: NOW.toISOString(), account: account() });
  const at = (run: RunState) => run.steps.map((_step, index) => progressOf(run, index));

  it("marks each step done, now, to do, failed or left", async () => {
    const fresh = startRun(plan);
    expect(at(fresh)[0]).toBe("now");
    expect(at(fresh).slice(1).every((progress) => progress === "to do")).toBe(true);

    let tick = 0;
    const waiting = await advance(fresh, { fetch: apiFetch(), signal: new AbortController().signal, now: () => (tick += 1) }, () => {});
    expect(at(waiting).slice(0, 5)).toEqual(["done", "done", "done", "now", "to do"]);

    expect(at(reduceRun(waiting, { type: "stopped" })).slice(2, 6)).toEqual(["done", "left", "left", "left"]);
    expect(at(reduceRun(waiting, { type: "failed", stepId: "seat", failure: { code: "x", message: "y" } }))[3]).toBe("failed");
    expect(at({ ...waiting, at: waiting.steps.length, status: "done" }).every((progress) => progress === "done")).toBe(true);
  });

  it("describes a step without the references it holds", () => {
    expect(plan.steps.map(describeStep).slice(0, 4)).toEqual([
      { kind: "Note", text: "Use your trip to London on Thu 8 Oct" },
      { kind: "Call", text: "Get the seat map" },
      { kind: "Say", text: "Here is the cabin on … to …. Free window seats are marked." },
      { kind: "Ask", text: "Let you choose a seat" },
    ]);
    expect(describeStep(plan.steps.at(-1)!)).toEqual({ kind: "Show", text: "Show the receipt" });
  });
});

describe("the catalogue", () => {
  const all = catalog();

  it("lists every journey, component and call", () => {
    expect(all.journeys.map((journey) => journey.name)).toEqual(["trips", "status", "change-flight", "seat", "bags", "check-in", "cancel", "book"]);
    expect(all.widgets.map((widget) => widget.type)).toEqual(WIDGET_TYPES);
    expect(all.tools).toHaveLength(6);
  });

  it("gives each a JSON Schema written from the schema the code checks against", () => {
    const seatMap = all.widgets.find((widget) => widget.type === "seat-map")!;
    expect(seatMap.props).toMatchObject({ type: "object", required: ["map", "flight", "wish", "current", "preselect"] });
    expect(seatMap.answer).toMatchObject({ type: "object", properties: { seat: { type: "string" } } });
    expect(all.widgets.find((widget) => widget.type === "receipt")!.answer).toBeNull();
    expect(all.tools.find((tool) => tool.name === "order")!.args).toMatchObject({ type: "object", required: ["booking", "changes", "expectedTotal"] });
  });

  it("knows a component's name from a made-up one", () => {
    expect(isWidgetType("seat-map")).toBe(true);
    expect(isWidgetType("hologram")).toBe(false);
    expect(isWidgetType("constructor")).toBe(false);
  });
});

describe("the gallery's examples", () => {
  const all = examples(TODAY, NOW);

  it("has one for every component, each fitting that component's own schema", () => {
    expect(all.map((example) => example.type)).toEqual(WIDGET_TYPES);
    for (const example of all) {
      const spec = WIDGETS[example.type];
      expect(spec.props.safeParse(example.props).success, `${example.type} props`).toBe(true);
      if (spec.answer) expect(spec.answer.safeParse(example.answer).success, `${example.type} answer`).toBe(true);
      else expect(example.answer).toBeNull();
    }
  });

  it("folds each answered example into one line", () => {
    const lines = Object.fromEntries(all.filter((example) => example.answer !== null).map((example) => [example.type, summaryOf(example.type, example.props, example.answer)]));
    expect(lines).toMatchObject({
      "trip-chooser": "London, Thu 8 Oct",
      "flight-search": "Paris, Fri 16 Oct",
      "bag-stepper": "2 more checked bags",
      "passenger-check": "Details confirmed",
      "price-summary": "Paid AED 155 with Visa ending 4242",
    });
    expect(lines["seat-map"]).toMatch(/^Seat \d+[AF], window, AED 35$/);
    expect(lines["flight-list"]).toMatch(/^JN 20\d, \d\d:\d\d to \d\d:\d\d$/);
    expect(lines.refund).toMatch(/^Cancelled, AED [\d,]+ back to Visa ending 4242$/);
    expect(Object.values(lines).every((line) => line !== "")).toBe(true);
  });
});
