import { WEEKDAYS, shortDay } from "@/airline/dates";
import { cityOf } from "@/airline/places";
import type { DateWish, Intent, RunState, Step, TripRef, Understanding } from "./types";
import { JOURNEY_NAMES } from "./types";

// Saying, in words, what the agent understood and where a plan has got to.
// Used by the "How it worked" panel, which shows the four steps as they went.

function tripWords(ref: TripRef): string {
  if (ref.code) return `booking ${ref.code}`;
  const parts: string[] = [];
  if (ref.place) parts.push(cityOf(ref.place));
  if (ref.flight) parts.push(ref.flight);
  if (ref.weekday !== undefined) parts.push(`the ${WEEKDAYS[ref.weekday]} one`);
  if (ref.date) parts.push(shortDay(ref.date));
  if (ref.next) parts.push("the next one");
  return parts.join(", ");
}

function whenWords(when: DateWish): string {
  if ("shiftDays" in when) {
    const days = Math.abs(when.shiftDays);
    return `${days} ${days === 1 ? "day" : "days"} ${when.shiftDays < 0 ? "earlier" : "later"}`;
  }
  return when.from === when.to ? shortDay(when.from) : `${shortDay(when.from)} to ${shortDay(when.to)}`;
}

export type Detail = { name: string; value: string };

/** One intent as a journey's name and the details that were picked out of the words. */
export function describeIntent(intent: Intent): { journey: string; details: Detail[] } {
  const details: Detail[] = [];
  if ("trip" in intent && intent.trip) details.push({ name: "trip", value: tripWords(intent.trip) });
  if ("from" in intent && intent.from) details.push({ name: "from", value: cityOf(intent.from) });
  if ("to" in intent && intent.to) details.push({ name: "to", value: cityOf(intent.to) });
  if ("when" in intent && intent.when) details.push({ name: "when", value: whenWords(intent.when) });
  if ("wish" in intent && intent.wish) details.push({ name: "seat wanted", value: intent.wish === "legroom" ? "extra legroom" : intent.wish });
  if ("seat" in intent && intent.seat) details.push({ name: "seat named", value: intent.seat });
  if ("add" in intent && intent.add) details.push({ name: "bags to add", value: String(intent.add) });
  if ("views" in intent) details.push({ name: "views of the account", value: intent.views.join(", ") });
  return { journey: JOURNEY_NAMES[intent.journey], details };
}

/** What kind of thing the words were taken to be, for a turn that led to no plan. */
export function describeUnderstanding(understanding: Understanding): string {
  switch (understanding.kind) {
    case "request":
      return "A request";
    case "amend":
      return "A change to the journey under way";
    case "answer":
      return "An answer to the component on screen";
    case "abandon":
      return "Leaving the journey under way";
    case "chat":
      return "Small talk";
    case "say":
      return "A question the rules have a fact for";
    case "talk":
      return "A question that needs an answer in words";
    case "cannot":
      return "Understood, but not possible";
    case "unknown":
      return "Not understood";
  }
}

export type StepProgress = "done" | "now" | "failed" | "left" | "to do";

/** How far each step of a run has got. */
export function progressOf(run: RunState, index: number): StepProgress {
  if (index < run.at) return "done";
  if (index > run.at) return run.status === "stopped" ? "left" : "to do";
  if (run.status === "failed") return "failed";
  if (run.status === "stopped") return "left";
  return run.status === "done" ? "done" : "now";
}

/** A step in a few words: what it does, whatever its kind. */
export function describeStep(step: Step): { kind: string; text: string } {
  switch (step.kind) {
    case "say":
      return { kind: "Say", text: step.text.replace(/\{\{\s*[^{}]+\s*\}\}/g, "…") };
    case "set":
      return { kind: "Note", text: step.label };
    case "tool":
      return { kind: "Call", text: step.label };
    case "show":
      return { kind: step.waits ? "Ask" : "Show", text: step.label };
  }
}
