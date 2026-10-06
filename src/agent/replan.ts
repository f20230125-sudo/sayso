import type { Plan, RunState } from "./types";

// Changing a journey that is already under way.
//
// "Make it an aisle seat instead" does not start again from nothing. The
// request is planned afresh with the change folded in, and the new plan is
// laid over the old run: everything before the first step that differs is
// kept, with its results, and the run picks up from there.

export type Replanned = {
  run: RunState;
  /** The first step that differs, or null when the new plan is the same as the old. */
  changedAt: number | null;
};

export function replan(run: RunState, plan: Plan): Replanned {
  const length = Math.max(run.steps.length, plan.steps.length);
  let changedAt: number | null = null;
  for (let index = 0; index < length; index += 1) {
    if (JSON.stringify(run.steps[index]) !== JSON.stringify(plan.steps[index])) {
      changedAt = index;
      break;
    }
  }
  if (changedAt === null) return { run, changedAt };

  // The change lies ahead: nothing done so far is touched.
  if (changedAt > run.at) return { run: { ...run, steps: plan.steps, expectations: plan.expectations }, changedAt };

  // The change is at or behind where the run stands: wind back to it.
  const kept = new Set(plan.steps.slice(0, changedAt).map((step) => step.id));
  return {
    run: {
      steps: plan.steps,
      expectations: plan.expectations,
      at: changedAt,
      results: Object.fromEntries(Object.entries(run.results).filter(([stepId]) => kept.has(stepId))),
      status: "running",
      checks: [],
    },
    changedAt,
  };
}
