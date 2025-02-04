import { z } from "zod";
import {
  apiErrorSchema,
  bookingSchema,
  calendarDaySchema,
  changeSchema,
  flightSchema,
  flightStatusSchema,
  isoDateSchema,
  orderResultSchema,
  quoteSchema,
  seatMapSchema,
} from "@/airline/schema";
import type { Deps, Failure, Json, ToolCall, ToolName } from "./types";

// The calls a plan may make to the airline's API.
//
// A plan names a tool and gives it arguments; it never holds an address. Each
// tool checks its arguments before calling and checks the answer after, so a
// wrong plan fails loudly here instead of putting nonsense on the screen.

type Tool = {
  /** What it does, in words a model or a person can use. */
  description: string;
  args: z.ZodType;
  result: z.ZodType;
  request: (args: never) => { method: "GET" | "POST"; url: string; body?: Json };
};

const tool = <A extends z.ZodType, R extends z.ZodType>(entry: {
  description: string;
  args: A;
  result: R;
  request: (args: z.infer<A>) => { method: "GET" | "POST"; url: string; body?: Json };
}): Tool => entry as unknown as Tool;

const orderArgs = z.object({ booking: bookingSchema.nullable(), changes: z.array(changeSchema).min(1) });

const route = { from: z.string().regex(/^[A-Z]{3}$/), to: z.string().regex(/^[A-Z]{3}$/) };

export const TOOLS: Record<ToolName, Tool> = {
  calendar: tool({
    description: "The lowest fare on each of a run of days, for one route.",
    args: z.object({ ...route, start: isoDateSchema, days: z.number().int().min(1).max(31) }),
    result: z.object({ days: z.array(calendarDaySchema) }),
    request: ({ from, to, start, days }) => ({ method: "GET", url: `/api/flights/calendar?from=${from}&to=${to}&start=${start}&days=${days}` }),
  }),
  searchFlights: tool({
    description: "Every flight on one route on one day.",
    args: z.object({ ...route, date: isoDateSchema }),
    result: z.object({ flights: z.array(flightSchema) }),
    request: ({ from, to, date }) => ({ method: "GET", url: `/api/flights?from=${from}&to=${to}&date=${date}` }),
  }),
  status: tool({
    description: "Where one flight stands at a moment: on time or late, the gate, and the steps to landing.",
    args: z.object({ flightId: z.string(), at: z.string() }),
    result: flightStatusSchema,
    request: ({ flightId, at }) => ({ method: "GET", url: `/api/flights/${encodeURIComponent(flightId)}/status?at=${encodeURIComponent(at)}` }),
  }),
  seatMap: tool({
    description: "The cabin of one flight, with taken seats marked.",
    args: z.object({ flightId: z.string() }),
    result: seatMapSchema,
    request: ({ flightId }) => ({ method: "GET", url: `/api/flights/${encodeURIComponent(flightId)}/seats` }),
  }),
  quote: tool({
    description: "What a list of changes to a booking would cost.",
    args: orderArgs,
    result: quoteSchema,
    request: (body) => ({ method: "POST", url: "/api/quotes", body: body as Json }),
  }),
  order: tool({
    description: "Carry out a list of changes to a booking, at the total the traveller agreed to.",
    args: orderArgs.extend({ expectedTotal: z.number().int() }),
    result: orderResultSchema,
    request: (body) => ({ method: "POST", url: "/api/orders", body: body as Json }),
  }),
};

/** A call that did not work, with what is known about it. */
export class ToolError extends Error {
  readonly failure: Failure;
  readonly call?: ToolCall;

  constructor(failure: Failure, call?: ToolCall) {
    super(failure.message);
    this.name = "ToolError";
    this.failure = failure;
    this.call = call;
  }
}

export function isAbort(problem: unknown): boolean {
  return problem instanceof Error && problem.name === "AbortError";
}

export async function callTool(name: ToolName, args: Json, deps: Deps): Promise<{ call: ToolCall; result: Json }> {
  const definition = TOOLS[name];
  const checked = definition.args.safeParse(args);
  if (!checked.success) {
    throw new ToolError({ code: "bad_plan", message: `The plan gave "${name}" arguments it cannot use.` });
  }

  const { method, url, body } = definition.request(checked.data as never);
  const started = deps.now();
  let response: Response;
  try {
    response = await deps.fetch(url, {
      method,
      signal: deps.signal,
      ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
    });
  } catch (problem) {
    if (isAbort(problem)) throw problem;
    throw new ToolError({ code: "network", message: "Could not reach the airline. Check your connection and try again." });
  }

  const data: unknown = await response.json().catch(() => null);
  const call: ToolCall = { tool: name, method, url, ...(body === undefined ? {} : { body }), status: response.status, ms: Math.round(deps.now() - started) };

  if (!response.ok) {
    const refusal = apiErrorSchema.safeParse(data);
    throw new ToolError(
      refusal.success ? refusal.data.error : { code: "server", message: `The airline answered ${response.status}. Try again in a moment.` },
      call,
    );
  }

  const result = definition.result.safeParse(data);
  if (!result.success) {
    throw new ToolError({ code: "bad_answer", message: "The airline sent back something unexpected. Try again in a moment." }, call);
  }
  return { call, result: result.data as Json };
}
