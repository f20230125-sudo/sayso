import { describe, expect, it } from "vitest";
import { suggestions } from "@/agent/replies";
import { demoAccount } from "@/airline/account";
import { localDay } from "@/airline/dates";
import { buildsLine, buildsOf } from "./builds";

// The line under each sentence on the welcome screen says which components the
// sentence builds. It is worked out from the real plan, and these tests pin
// what it says for the sentences the desk suggests, so a change to a journey
// shows up here instead of going stale on the page.

const NOW = new Date("2026-10-06T10:30:00+04:00");
const TODAY = localDay(NOW);
const account = demoAccount(TODAY);

describe("what a suggested sentence builds", () => {
  const tries = suggestions(account, TODAY, NOW);

  it("is said for every sentence the desk suggests", () => {
    expect(tries).toHaveLength(5);
    for (const words of tries) expect(buildsLine(words, account, TODAY, NOW), words).not.toBeNull();
  });

  it("lists the components of the plan, in the order they appear", () => {
    expect(buildsLine(tries[0], account, TODAY, NOW)).toBe("Days, flights, seat map, price summary, receipt");
    expect(buildsLine(tries[1], account, TODAY, NOW)).toBe("Passenger check, boarding pass");
    expect(buildsLine(tries[2], account, TODAY, NOW)).toBe("Flight status");
    expect(buildsLine(tries[3], account, TODAY, NOW)).toBe("Flights, price summary, receipt");
    expect(buildsLine(tries[4], account, TODAY, NOW)).toBe("Answer");
  });

  it("changes when the journey does: a sentence with more parts builds more", () => {
    const one = buildsOf("Is my flight on time?", account, TODAY, NOW) ?? [];
    const three = buildsOf("Move my London flight to next week, window seat, and add a bag", account, TODAY, NOW) ?? [];
    expect(three.length).toBeGreaterThan(one.length);
  });

  it("says nothing for words the rules do not turn into a plan", () => {
    expect(buildsLine("sing me a song", account, TODAY, NOW)).toBeNull();
    expect(buildsLine("hello", account, TODAY, NOW)).toBeNull();
  });
});
