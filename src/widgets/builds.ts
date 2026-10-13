import { planFor } from "@/agent/plan";
import { understandByRules } from "@/agent/understand/rules";
import type { IsoDate } from "@/airline/dates";
import type { Account } from "@/airline/schema";
import { WIDGETS } from "./specs";

// What a sentence on the welcome screen would put on the page, said under it.
//
// Nothing here is written by hand. The sentence is run through the same two
// functions the desk uses (the rules that read it, the plan that answers it)
// and the components of that plan are listed by their names, in the order they
// appear. If a journey changes, this line changes with it; a unit test pins
// what it says today.

/** The names of the components the plan for these words shows, in order and without repeats. Null when the rules do not turn the words into a plan. */
export function buildsOf(words: string, account: Account, today: IsoDate, now: Date): string[] | null {
  const understanding = understandByRules(words, { today, account });
  if (understanding.kind !== "request") return null;
  const plan = planFor(understanding.intents, { today, now: now.toISOString(), account });
  const titles: string[] = [];
  for (const step of plan.steps) {
    if (step.kind !== "show") continue;
    const title = WIDGETS[step.widget].title;
    if (!titles.includes(title)) titles.push(title);
  }
  return titles.length > 0 ? titles : null;
}

/** "Days, flights, seat map, price summary, receipt": the names as one line, in sentence case. */
export function buildsLine(words: string, account: Account, today: IsoDate, now: Date): string | null {
  const titles = buildsOf(words, account, today, now);
  if (!titles) return null;
  return titles.map((title, index) => (index === 0 ? title : title.charAt(0).toLowerCase() + title.slice(1))).join(", ");
}
