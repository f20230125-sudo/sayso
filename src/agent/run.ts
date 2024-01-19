import { WIDGETS, type WidgetType } from "@/widgets/specs";
import { runChecks } from "./check";
import { MissingReference, fill } from "./reference";
import { ToolError, callTool, isAbort } from "./tools";
import type { Deps, Failure, Json, Plan, RunEvent, RunState, Step } from "./types";

// Running a plan.
//
// A run is a state machine. `advance` works through the steps and reports each
// thing that happens as an event. `reduceRun` is the only place the state
// changes: the same function is used here, by the Redux store and by the
// tests, so they cannot disagree about where a run has got to.
//
// A run stops in one of three ways: it reaches the end, a step fails, or it
// shows a component that needs an answer. In the last case nothing is left
// running. The state says "waiting at step 4", and `advance` is simply called
// again once the answer is in. That is why a reload in the middle of a
// journey loses nothing.

export function startRun(plan: Plan): RunState {
  return { steps: plan.steps, expectations: plan.expectations, at: 0, results: {}, status: "running", checks: [] };
}

export function reduceRun(run: RunState, event: RunEvent): RunState {
  const done = (stepId: string, result: Json): RunState => ({
    ...run,
    results: { ...run.results, [stepId]: result },
    at: run.at + 1,
    status: "running",
    failure: undefined,
  });

  switch (event.type) {
    case "said":
      return done(event.stepId, event.text);
    case "set":
      return done(event.stepId, event.value);
    case "tool-started":
      return run;
    case "resumed":
      return { ...run, status: "running", failure: undefined };
    case "tool-finished":
      return done(event.stepId, event.result);
    case "shown":
      // A component that waits holds the run at this step until it is answered.
      return event.waits ? { ...run, status: "waiting", failure: undefined } : done(event.stepId, null);
    case "answered":
      return done(event.stepId, event.answer);
    case "failed":
      return { ...run, status: "failed", failure: { ...event.failure, stepId: event.stepId } };
    case "checked":
      return { ...run, checks: event.checks };
    case "finished":
      return { ...run, status: "done" };
    case "stopped":
      return { ...run, status: "stopped" };
  }
}

function failureOf(problem: unknown): Failure {
  if (problem instanceof ToolError) return problem.failure;
  if (problem instanceof MissingReference) {
    return { code: "bad_plan", message: `The plan refers to "${problem.path}", which nothing has produced.` };
  }
  return { code: "unexpected", message: "Something went wrong while doing that. Try again." };
}

/**
 * Work through the plan from where the run stands, until it finishes, fails,
 * is stopped, or shows a component that waits. Every change is reported
 * through `emit`; the run that results is also returned.
 */
export async function advance(run: RunState, deps: Deps, emit: (event: RunEvent) => void): Promise<RunState> {
  let state = run;
  const report = (event: RunEvent) => {
    state = reduceRun(state, event);
    emit(event);
  };

  // A run that is waiting, finished or stopped has nothing to advance.
  if (state.status === "failed") report({ type: "resumed" });
  else if (state.status !== "running") return state;

  while (state.at < state.steps.length) {
    if (deps.signal.aborted) {
      report({ type: "stopped" });
      return state;
    }

    const step = state.steps[state.at];
    try {
      switch (step.kind) {
        case "say":
          report({ type: "said", stepId: step.id, text: String(fill(step.text, state.results)) });
          break;
        case "set":
          report({ type: "set", stepId: step.id, value: step.value });
          break;
        case "tool": {
          report({ type: "tool-started", stepId: step.id, tool: step.tool, label: step.label });
          const { call, result } = await callTool(step.tool, fill(step.args, state.results), deps);
          report({ type: "tool-finished", stepId: step.id, call, result });
          break;
        }
        case "show": {
          const props = fill(step.props, state.results);
          if (!WIDGETS[step.widget].props.safeParse(props).success) {
            report({ type: "failed", stepId: step.id, failure: { code: "bad_plan", message: `The plan gave "${step.widget}" properties it cannot show.` } });
            return state;
          }
          report({ type: "shown", stepId: step.id, widget: step.widget, props, waits: step.waits });
          if (step.waits) return state;
          break;
        }
      }
    } catch (problem) {
      if (isAbort(problem) || deps.signal.aborted) {
        report({ type: "stopped" });
        return state;
      }
      report({
        type: "failed",
        stepId: step.id,
        failure: failureOf(problem),
        ...(problem instanceof ToolError && problem.call ? { call: problem.call } : {}),
      });
      return state;
    }
  }

  report({ type: "checked", checks: runChecks(state) });
  report({ type: "finished" });
  return state;
}

/**
 * The event for the traveller's answer to the component the run is waiting
 * on, or null when the run is not waiting for that, or the answer is not one
 * the component can give.
 */
export function answerEvent(run: RunState, stepId: string, answer: Json): RunEvent | null {
  const step = run.steps[run.at];
  if (run.status !== "waiting" || !step || step.id !== stepId || step.kind !== "show") return null;
  const schema = WIDGETS[step.widget].answer;
  if (!schema || !schema.safeParse(answer).success) return null;
  return { type: "answered", stepId, answer };
}

/** The step a run is waiting on, if it is waiting. */
export function waitingStep(run: RunState | null): Extract<Step, { kind: "show" }> | null {
  if (!run || run.status !== "waiting") return null;
  const step = run.steps[run.at];
  return step && step.kind === "show" ? step : null;
}

// --- What a run looks like on the page ---------------------------------------

export type Item =
  | { kind: "say"; stepId: string; text: string }
  | { kind: "widget"; stepId: string; widget: WidgetType; props: Json; state: "active" | "answered" | "shown"; answer: Json }
  | { kind: "working"; stepId: string; label: string }
  | { kind: "failed"; stepId: string; failure: Failure };

/**
 * The lines and components of a run, in order. They are worked out from the
 * run's state every time, never stored, so they cannot fall out of step with
 * it: wind the run back two steps and two things leave the page.
 */
export function itemsOf(run: RunState): Item[] {
  const items: Item[] = [];
  const reached = run.status === "waiting" ? run.at + 1 : run.at;

  for (let index = 0; index < Math.min(reached, run.steps.length); index += 1) {
    const step = run.steps[index];
    if (step.kind === "say") {
      const text = run.results[step.id];
      if (typeof text === "string") items.push({ kind: "say", stepId: step.id, text });
    } else if (step.kind === "show") {
      let props: Json;
      try {
        props = fill(step.props, run.results);
      } catch {
        continue;
      }
      const answered = index < run.at;
      items.push({
        kind: "widget",
        stepId: step.id,
        widget: step.widget,
        props,
        state: !step.waits ? "shown" : answered ? "answered" : "active",
        answer: answered ? (run.results[step.id] ?? null) : null,
      });
    }
  }

  const current = run.steps[run.at];
  if (run.status === "running" && current?.kind === "tool") items.push({ kind: "working", stepId: current.id, label: current.label });
  if (run.status === "failed" && run.failure) items.push({ kind: "failed", stepId: run.failure.stepId, failure: run.failure });
  return items;
}
