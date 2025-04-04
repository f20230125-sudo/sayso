import { describe, expect, it } from "vitest";
import type { Account, Payment } from "@/airline/schema";
import { NOW, TODAY, account, apiFetch } from "@/test/api";
import { WIDGETS, blockSchema } from "@/widgets/specs";
import { planFor } from "./plan";
import { advance, itemsOf, startRun } from "./run";
import { VIEW_NAMES, type Intent, type ViewName } from "./types";
import { readReply } from "./understand/model";
import { understandByRules } from "./understand/rules";
import { leadFor, viewBlock } from "./views";

// TODAY is Tuesday 6 October 2026.

const payment = (date: string, amount: number, route: string): Payment => ({ id: `P-${date}-${amount}`, date, amount, what: "Flight", route, bookingCode: "X" });

/** An account whose payments are simple enough to add up by hand. */
function withPayments(...payments: Payment[]): Account {
  return { ...account(), payments };
}

const simple = withPayments(
  payment("2026-10-01", 1000, "Dubai to London"),
  payment("2026-09-12", 600, "Dubai to Mumbai"),
  payment("2026-09-02", 400, "Dubai to London"),
  payment("2026-03-20", -200, "Dubai to Cairo"), // a refund
  payment("2025-12-30", 900, "Dubai to Paris"), // last year: not counted
  payment("2026-11-15", 5000, "Dubai to Singapore"), // in the future: not counted
);

describe("views of the account", () => {
  it("adds up this year's spending, refunds taken off", () => {
    expect(viewBlock("spending", simple, TODAY)).toEqual({
      kind: "figures",
      figures: [
        { label: "Spent this year", value: "AED 1,800" },
        { label: "Payments", value: "3" },
        { label: "Largest", value: "AED 1,000", note: "Dubai to London" },
      ],
    });
    expect(leadFor("spending", simple, TODAY)).toBe("You have spent AED 1,800 on flights so far this year.");
  });

  it("lays spending out by month, January to this month, oldest first", () => {
    const block = viewBlock("spending-by-month", simple, TODAY);
    if (block?.kind !== "columns") throw new Error("Expected columns.");
    expect(block.rows.map((row) => row.label)).toEqual(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct"]);
    expect(block.rows.map((row) => row.value)).toEqual([0, 0, -200, 0, 0, 0, 0, 0, 1000, 1000]);
    expect(block.rows[2].text).toBe("− AED 200");
  });

  it("lays spending out by route, largest first", () => {
    expect(viewBlock("spending-by-route", simple, TODAY)).toEqual({
      kind: "bars",
      title: "Spending by route",
      rows: [
        { label: "Dubai to London", value: 1400, text: "AED 1,400" },
        { label: "Dubai to Mumbai", value: 600, text: "AED 600" },
      ],
    });
  });

  it("lists the latest payments, newest first, leaving out what has not happened yet", () => {
    const block = viewBlock("payments", simple, TODAY);
    if (block?.kind !== "table") throw new Error("Expected a table.");
    expect(block.columns).toEqual(["Date", "For", "Route", "Amount"]);
    expect(block.rows.map((row) => row[0])).toEqual(["Thu 1 Oct", "Sat 12 Sep", "Wed 2 Sep", "Fri 20 Mar", "Tue 30 Dec 2025"]);
    expect(block.rows[3][3]).toBe("− AED 200");
  });

  it("lists the upcoming trips as a table", () => {
    const block = viewBlock("upcoming", account(), TODAY);
    if (block?.kind !== "table") throw new Error("Expected a table.");
    expect(block.rows.map((row) => row.slice(0, 2))).toEqual([
      ["JN 303", "Dubai to Mumbai"],
      ["JN 203", "Dubai to London"],
      ["JN 261", "Dubai to Istanbul"],
    ]);
    expect(block.rows[2].slice(3)).toEqual(["None", "0"]);
  });

  it("has nothing to show for an empty account, except the figures", () => {
    const empty = withPayments();
    expect(viewBlock("spending", empty, TODAY)).toMatchObject({ figures: [{ value: "AED 0" }, { value: "0" }] });
    for (const view of ["spending-by-month", "spending-by-route", "payments"] as const) expect(viewBlock(view, empty, TODAY)).toBeNull();
    expect(viewBlock("upcoming", { ...empty, bookings: [] }, TODAY)).toBeNull();
  });

  it("gives blocks that fit the answer card's schema, for the demo account too", () => {
    for (const view of VIEW_NAMES) {
      const block = viewBlock(view, account(), TODAY);
      expect(blockSchema.safeParse(block).success, view).toBe(true);
    }
  });
});

describe("asking about the account", () => {
  const read = (words: string) => understandByRules(words, { today: TODAY, account: account() });
  const views = (...names: ViewName[]) => ({ kind: "request", intents: [{ journey: "insight", views: names }] });

  it("is understood by the rules for the common questions", () => {
    expect(read("How much have I spent this year?")).toEqual(views("spending", "spending-by-month"));
    expect(read("what did I spend on flights")).toEqual(views("spending", "spending-by-month"));
    expect(read("show my spending by route")).toEqual(views("spending-by-route"));
    expect(read("where does my money go")).toEqual(views("spending-by-route"));
    expect(read("what have I paid month by month")).toEqual(views("spending-by-month"));
    expect(read("show my recent payments")).toEqual(views("payments"));
  });

  it("is told apart from a question about what something costs", () => {
    expect(read("how much is a bag?")).toMatchObject({ kind: "say" });
    expect(read("how much to cancel")).toMatchObject({ kind: "say" });
  });

  it("is accepted from a model only with views that exist", () => {
    const context = { today: TODAY, account: account() };
    expect(readReply('{"kind":"request","intents":[{"journey":"insight","views":["upcoming","spending"]}]}', context)).toEqual({
      ok: true,
      understanding: { kind: "request", intents: [{ journey: "insight", views: ["upcoming", "spending"] }] },
    });
    expect(readReply('{"kind":"request","intents":[{"journey":"insight","views":["net-worth"]}]}', context)).toMatchObject({ ok: false });
    expect(readReply('{"kind":"request","intents":[{"journey":"insight","views":[]}]}', context)).toMatchObject({ ok: false });
  });
});

describe("planning and running an answer", () => {
  const plan = (intents: Intent[], from: Account = account()) => planFor(intents, { today: TODAY, now: NOW.toISOString(), account: from });

  it("holds finished numbers, and needs no call to the airline", async () => {
    const { steps, expectations } = plan([{ journey: "insight", views: ["spending", "spending-by-month"] }], simple);
    expect(steps.map((step) => step.id)).toEqual(["insight-lead", "insight"]);
    expect(steps[1]).toMatchObject({ widget: "answer-card", waits: false, props: { title: "What you have spent this year", blocks: [{ kind: "figures" }, { kind: "columns" }] } });
    expect(expectations).toEqual([]);

    const seen: unknown[] = [];
    let tick = 0;
    const run = await advance(startRun({ steps, expectations }), { fetch: apiFetch({ seen: seen as never }), signal: new AbortController().signal, now: () => (tick += 1) }, () => {});
    expect(run.status).toBe("done");
    expect(seen).toEqual([]);
    const card = itemsOf(run)[1];
    expect(card).toMatchObject({ kind: "widget", widget: "answer-card", state: "shown" });
    expect(WIDGETS["answer-card"].props.safeParse(card.kind === "widget" ? card.props : null).success).toBe(true);
  });

  it("leaves out views with nothing in them, and says so when all are empty", () => {
    const empty = withPayments();
    expect(plan([{ journey: "insight", views: ["spending", "spending-by-route"] }], empty).steps[1]).toMatchObject({ props: { blocks: [{ kind: "figures" }] } });
    expect(plan([{ journey: "insight", views: ["payments"] }], empty).steps).toMatchObject([{ kind: "say", text: "There is nothing in your account to show for that yet." }]);
  });

  it("uses each view once, and at most three", () => {
    const { steps } = plan([{ journey: "insight", views: ["payments", "payments", "upcoming", "spending", "spending-by-route"] }]);
    expect(steps[1]).toMatchObject({ props: { blocks: [{}, {}, {}] } });
  });
});
