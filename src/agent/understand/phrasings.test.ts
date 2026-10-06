import { describe, expect, it } from "vitest";
import { TODAY, account } from "@/test/api";
import { FACTS } from "../talk";
import type { Intent, Understanding } from "../types";
import { understandByRules } from "./rules";

// How the rules read everyday sentences, with no model.
//
// The other tests check sentences written to exercise one rule each. This is
// the opposite: things a traveller might type, written before the rules were
// tuned for them, each with the reading a person would give it.
//
// It was done in two rounds, and the first score of each is kept here because
// it is the honest measure of rules like these:
//
//   Round one, 50 sentences: 36 read correctly, 11 not understood, 3 read
//   wrongly. Two of the three started booking a flight for someone who had
//   said they could not go, or wanted to move one.
//   Round two, 30 new sentences, after round one was fixed: 24 read
//   correctly, 2 not understood, 4 read wrongly. One started a booking from
//   "how early should I get to the airport".
//   Round three, 25 new sentences, after round two was fixed: 20 read
//   correctly, 4 not understood, 1 read wrongly, and that one harmlessly (it
//   opened the seat map for a question about what a seat costs).
//
// A wrong reading is worse than none. So every sentence here must be read as
// written, and the ones the rules cannot read must be left alone, not guessed
// at. A fourth round of new sentences would find new misses: about one in
// five, on the evidence of round three. That is what the optional model is for.
//
// TODAY is Tuesday 6 October 2026.

const day = (date: string) => ({ from: date, to: date });
const read = (words: string) => understandByRules(words, { today: TODAY, account: account() });
const asks = (...intents: Intent[]): Understanding => ({ kind: "request", intents });
const spending = asks({ journey: "insight", views: ["spending", "spending-by-month"] });

const READ: [string, Understanding][] = [
  // See my trips
  ["what trips do I have", asks({ journey: "trips" })],
  ["where am I going next", asks({ journey: "trips" })],
  ["do I have any flights booked", asks({ journey: "trips" })],
  ["my itinerary", asks({ journey: "trips" })],
  ["upcoming travel", asks({ journey: "trips" })],

  // Flight status
  ["is my flight delayed", asks({ journey: "status" })],
  ["what time does my flight leave", asks({ journey: "status" })],
  ["which gate for mumbai", asks({ journey: "status", trip: { place: "BOM" } })],
  ["has my plane left yet", asks({ journey: "status" })],
  ["when do I board", asks({ journey: "status" })],

  // Change a flight
  ["I need to fly a day later", asks({ journey: "change-flight", when: { shiftDays: 1 } })],
  ["can I get an earlier flight to london", asks({ journey: "change-flight", trip: { place: "LHR" } })],
  ["I can't make thursday, can I go friday instead", asks({ journey: "change-flight", trip: { weekday: 4 }, when: day("2026-10-09") })],
  ["push my london trip back a week", asks({ journey: "change-flight", trip: { place: "LHR" }, when: { shiftDays: 7 } })],
  ["reschedule my istanbul flight", asks({ journey: "change-flight", trip: { place: "IST" } })],
  ["I want to travel on the 20th instead", asks({ journey: "change-flight", when: day("2026-10-20") })],
  ["change the date of my london flight", asks({ journey: "change-flight", trip: { place: "LHR" } })],

  // Choose a seat
  ["can I sit by the window", asks({ journey: "seat", wish: "window" })],
  ["I'd like an aisle seat please", asks({ journey: "seat", wish: "aisle" })],
  ["I want more space for my legs", asks({ journey: "seat", wish: "legroom" })],
  ["change my seat to 12A", asks({ journey: "seat", seat: "12A" })],
  ["pick a seat for my istanbul flight", asks({ journey: "seat", trip: { place: "IST" } })],
  // The seat map is shown with nothing marked: "not a middle" is not "a middle".
  ["I don't want a middle seat", asks({ journey: "seat" })],
  ["upgrade my seat", asks({ journey: "seat" })],

  // Add bags
  ["I have an extra suitcase", asks({ journey: "bags", add: 1 })],
  ["can I bring another bag", asks({ journey: "bags", add: 1 })],
  ["add luggage to my london booking", asks({ journey: "bags", trip: { place: "LHR" } })],
  ["I need to check two bags", asks({ journey: "bags", add: 2 })],

  // Check in
  ["I want to check in", asks({ journey: "check-in" })],
  ["check in for my flight tomorrow", asks({ journey: "check-in", trip: { date: "2026-10-07" } })],
  ["get my boarding pass", asks({ journey: "check-in" })],
  ["can I check in online", asks({ journey: "check-in" })],

  // Cancel and refund
  ["cancel my booking", asks({ journey: "cancel" })],
  ["I want my money back for london", asks({ journey: "cancel", trip: { place: "LHR" } })],
  ["drop the mumbai flight", asks({ journey: "cancel", trip: { place: "BOM" } })],

  // Book a flight
  ["I want to go to paris", asks({ journey: "book", to: "CDG" })],
  ["find me a flight to singapore next month", asks({ journey: "book", to: "SIN", when: { from: "2026-11-01", to: "2026-11-30" } })],
  ["flights to cairo on friday", asks({ journey: "book", to: "CAI", when: day("2026-10-09") })],
  ["I need to be in london on the 15th", asks({ journey: "book", to: "LHR", when: day("2026-10-15") })],
  ["book london", asks({ journey: "book", to: "LHR" })],
  ["any flights to new york this weekend", asks({ journey: "book", to: "JFK", when: { from: "2026-10-10", to: "2026-10-11" } })],

  // Questions about the account
  ["how much did I pay for flights", spending],
  ["what's my total spend", spending],
  ["show me my receipts", asks({ journey: "insight", views: ["payments"] })],

  // Questions about cost and rules, answered with the airline's own fact
  ["how much does a bag cost", { kind: "say", text: FACTS.bags }],
  ["what's the cancellation fee", { kind: "say", text: FACTS.cancel }],
  ["when does check-in open", { kind: "say", text: FACTS.checkIn }],
  ["can I bring a pet", { kind: "say", text: FACTS.cannot }],
];

const READ_LATER: [string, Understanding][] = [
  ["show me my flights", asks({ journey: "trips" })],
  ["what have I booked", asks({ journey: "trips" })],
  ["is JN 203 on time", asks({ journey: "status", trip: { flight: "JN 203" } })],
  ["will my london flight be late", asks({ journey: "status", trip: { place: "LHR" } })],
  ["what's the status of my istanbul flight", asks({ journey: "status", trip: { place: "IST" } })],
  ["move my mumbai flight to friday", asks({ journey: "change-flight", trip: { place: "BOM" }, when: day("2026-10-09") })],
  ["I'd like to leave two days earlier", asks({ journey: "change-flight", when: { shiftDays: -2 } })],
  // Thursday is the flight there is. Saturday is the one wanted.
  ["can I fly out on saturday instead of thursday", asks({ journey: "change-flight", trip: { weekday: 4 }, when: day("2026-10-10") })],
  ["switch my london flight to the 12th", asks({ journey: "change-flight", trip: { place: "LHR" }, when: day("2026-10-12") })],
  ["delay my trip to istanbul by a week", asks({ journey: "change-flight", trip: { place: "IST" }, when: { shiftDays: 7 } })],
  ["seat by the aisle on my istanbul flight", asks({ journey: "seat", trip: { place: "IST" }, wish: "aisle" })],
  ["I want to sit near the front", asks({ journey: "seat", wish: "front" })],
  ["give me an exit row", asks({ journey: "seat", wish: "legroom" })],
  ["two more bags please", asks({ journey: "bags", add: 2 })],
  ["add a suitcase to istanbul", asks({ journey: "bags", trip: { place: "IST" }, add: 1 })],
  ["I need extra baggage", asks({ journey: "bags" })],
  ["check me in for london", asks({ journey: "check-in", trip: { place: "LHR" } })],
  ["boarding pass please", asks({ journey: "check-in" })],
  ["cancel istanbul", asks({ journey: "cancel", trip: { place: "IST" } })],
  ["refund my london ticket", asks({ journey: "cancel", trip: { place: "LHR" } })],
  ["I'd like to cancel", asks({ journey: "cancel" })],
  ["book me to delhi tomorrow", asks({ journey: "book", to: "DEL", when: day("2026-10-07") })],
  ["looking for a flight to bangkok in november", asks({ journey: "book", to: "BKK" })],
  ["one ticket to frankfurt for the 25th", asks({ journey: "book", to: "FRA", when: day("2026-10-25") })],
  ["what did my trips cost me", spending],
  ["do you serve vegetarian meals", { kind: "say", text: FACTS.cannot }],
  ["what's the baggage allowance", { kind: "say", text: FACTS.bags }],
  // "Get to" the airport is not "get me to" a city: nothing is booked.
  ["how early should I get to the airport", { kind: "say", text: FACTS.airport }],
  ["hello there", { kind: "chat", about: "hello" }],
  ["thank you so much", { kind: "chat", about: "thanks" }],
];

const READ_LAST: [string, Understanding][] = [
  ["which flights am I on", asks({ journey: "trips" })],
  ["my bookings please", asks({ journey: "trips" })],
  ["is the mumbai flight on schedule", asks({ journey: "status", trip: { place: "BOM" } })],
  ["where do I board for london", asks({ journey: "status", trip: { place: "LHR" } })],
  ["flight status", asks({ journey: "status" })],
  ["can I fly on sunday instead", asks({ journey: "change-flight", when: day("2026-10-11") })],
  ["I want to leave a day earlier for london", asks({ journey: "change-flight", trip: { place: "LHR" }, when: { shiftDays: -1 } })],
  ["put me on a later flight", asks({ journey: "change-flight" })],
  ["bring my istanbul flight forward by two days", asks({ journey: "change-flight", trip: { place: "IST" }, when: { shiftDays: -2 } })],
  ["window please", asks({ journey: "seat", wish: "window" })],
  ["can I get more legroom on the mumbai flight", asks({ journey: "seat", trip: { place: "BOM" }, wish: "legroom" })],
  ["seat 3F", asks({ journey: "seat", seat: "3F" })],
  ["extra bag for istanbul", asks({ journey: "bags", trip: { place: "IST" } })],
  ["I'm taking three suitcases", asks({ journey: "bags", add: 3 })],
  ["online check in", asks({ journey: "check-in" })],
  ["I need to cancel my trip to london", asks({ journey: "cancel", trip: { place: "LHR" } })],
  ["get me a refund", asks({ journey: "cancel" })],
  ["book a ticket to cairo for next tuesday", asks({ journey: "book", to: "CAI", when: day("2026-10-13") })],
  ["need a flight to nairobi on the 30th", asks({ journey: "book", to: "NBO", when: day("2026-10-30") })],
  ["how much have I paid in total", spending],
  ["do I have to pay to pick a seat", { kind: "say", text: FACTS.seats }],
  ["what are the fees for changing a flight", { kind: "say", text: FACTS.change }],
  ["good morning", { kind: "chat", about: "hello" }],
];

describe("everyday sentences, read by the rules alone", () => {
  it.each(READ)("round one: %s", (words, reading) => {
    expect(read(words)).toEqual(reading);
  });

  it.each(READ_LATER)("round two: %s", (words, reading) => {
    expect(read(words)).toEqual(reading);
  });

  it.each(READ_LAST)("round three: %s", (words, reading) => {
    expect(read(words)).toEqual(reading);
  });
});

describe("sentences the rules must leave alone", () => {
  it("asks back, and books nothing, when someone says they cannot go", () => {
    expect(read("I can't go to istanbul anymore")).toEqual({
      kind: "unknown",
      hint: 'I am not sure what you would like done about your Istanbul trip. You can say "cancel my Istanbul trip" or "move my Istanbul flight to Friday".',
    });
  });

  it("never takes a sentence with a not in it as a request", () => {
    const unsure = 'I am not sure what you would like done. You can say it straight, such as "cancel my booking" or "move my flight to Friday".';
    expect(read("don't cancel my flight")).toMatchObject({ kind: "unknown" });
    expect(read("I do not want to fly to Paris")).toMatchObject({ kind: "unknown" });
    expect(read("I won't be able to travel next week")).toEqual({ kind: "unknown", hint: unsure });
    expect(read("I cannot check in")).toMatchObject({ kind: "unknown" });
    expect(read("please dont add any bags")).toMatchObject({ kind: "unknown" });
  });

  it("still reads the rest of a sentence that has a not in one part", () => {
    expect(read("I can't make it, cancel my london flight")).toEqual(asks({ journey: "cancel", trip: { place: "LHR" } }));
    expect(read("I don't have a seat yet, give me a window")).toEqual(asks({ journey: "seat", wish: "window" }));
  });

  it("says it did not understand what it has no rule for, with no guess", () => {
    expect(read("I'm bringing more stuff")).toEqual({ kind: "unknown" });
    expect(read("my flight was awful")).toEqual({ kind: "unknown" });
    expect(read("the wifi on my last flight was terrible")).toEqual({ kind: "unknown" });
    expect(read("I don't need my bag anymore")).toMatchObject({ kind: "unknown" });
    expect(read("I can't find my passport")).toEqual({ kind: "unknown" });
  });
});
