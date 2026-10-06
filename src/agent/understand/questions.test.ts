import { describe, expect, it } from "vitest";
import { TODAY, account } from "@/test/api";
import { FACTS } from "../talk";
import { understandByRules } from "./rules";

const read = (words: string) => understandByRules(words, { today: TODAY, account: account() });

describe("questions about cost and rules", () => {
  it("are answered with the airline's own fact, not taken as a request", () => {
    expect(read("How much is a bag?")).toEqual({ kind: "say", text: FACTS.bags });
    expect(read("how much is it to bring a suitcase")).toEqual({ kind: "say", text: FACTS.bags });
    expect(read("what does a window seat cost?")).toEqual({ kind: "say", text: FACTS.seats });
    expect(read("how much to cancel")).toEqual({ kind: "say", text: FACTS.cancel });
    expect(read("is there a fee to change my flight")).toEqual({ kind: "say", text: FACTS.change });
    expect(read("how many kg can I carry on")).toEqual({ kind: "say", text: FACTS.bags });
  });

  it("are left for a model when the rules have no fact for them", () => {
    expect(read("how many moons does Jupiter have?")).toEqual({ kind: "unknown" });
    expect(read("what are the rules about cats")).toEqual({ kind: "unknown" });
  });

  it("do not swallow a request that merely starts like one", () => {
    // "What flights do I have" asks to see trips. It is not a question about cost.
    expect(read("what flights do I have?")).toEqual({ kind: "request", intents: [{ journey: "trips" }] });
    expect(read("add a bag")).toEqual({ kind: "request", intents: [{ journey: "bags", add: 1 }] });
  });
});
