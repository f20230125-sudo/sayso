import { z } from "zod";
import { demoAccount } from "@/airline/account";
import type { IsoDate } from "@/airline/dates";
import { accountSchema, type Account } from "@/airline/schema";
import type { Turn } from "./conversationSlice";

// Keeping the account and the conversation in the browser.
//
// What comes back out of storage is checked before it is used: it may have
// been written by an older version of the app, or edited by hand. Anything
// that does not fit is dropped and the demo starts fresh.

export const STATE_KEY = "sayso:state";
const VERSION = 1;

export type KeyValueStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const stepSchema = z.object({ id: z.string(), kind: z.enum(["say", "set", "tool", "show"]) }).loose();

const runSchema = z.object({
  steps: z.array(stepSchema),
  expectations: z.array(z.object({ kind: z.string() }).loose()),
  at: z.number().int().nonnegative(),
  results: z.record(z.string(), z.unknown()),
  status: z.enum(["running", "waiting", "done", "failed", "stopped"]),
  failure: z.object({ stepId: z.string(), code: z.string(), message: z.string() }).optional(),
  checks: z.array(z.object({ label: z.string(), pass: z.boolean() })),
});

const logSchema = z.object({ at: z.number(), type: z.string(), stepId: z.string().nullable() });

const turnSchema = z.object({
  id: z.string(),
  startedAt: z.string().nullable().default(null),
  words: z.string(),
  understanding: z.object({ kind: z.string() }).loose(),
  brain: z.enum(["rules", "model"]),
  model: z.string().nullable().default(null),
  understoodMs: z.number(),
  intents: z.array(z.object({ journey: z.string() }).loose()),
  run: runSchema.nullable(),
  reply: z.string().nullable(),
  replyBy: z.string().nullable().default(null),
  // A reply that was still arriving when the page closed has stopped arriving.
  streaming: z.boolean().default(false).transform(() => false),
  marks: z.array(z.object({ words: z.string(), beforeStep: z.string().nullable(), reply: z.string().optional(), by: z.string().optional() })),
  calls: z.array(z.object({ stepId: z.string() }).loose()),
  log: z.array(logSchema).default([]),
  closing: z.string().nullable(),
});

const savedSchema = z.object({ version: z.literal(VERSION), account: accountSchema, turns: z.array(turnSchema) });

export type Saved = { account: Account; turns: Turn[] };

/**
 * What the browser remembers, or a fresh demo.
 *
 * The demo trips are dated from the day they were made. On a later day the
 * flight "tomorrow" has gone, so the demo starts again from today.
 */
export function load(storage: KeyValueStore | null, today: IsoDate): Saved {
  const fresh: Saved = { account: demoAccount(today), turns: [] };
  if (!storage) return fresh;

  let parsed: z.infer<typeof savedSchema>;
  try {
    const result = savedSchema.safeParse(JSON.parse(storage.getItem(STATE_KEY) ?? "null"));
    if (!result.success) return fresh;
    parsed = result.data;
  } catch {
    return fresh;
  }
  if (parsed.account.seededOn !== today) return fresh;

  // A run that was in the middle of a call when the page closed is not
  // running any more. Mark it as interrupted so it can be tried again.
  const turns = (parsed.turns as unknown as Turn[]).map((turn) =>
    turn.run?.status === "running"
      ? {
          ...turn,
          run: {
            ...turn.run,
            status: "failed" as const,
            failure: {
              stepId: turn.run.steps[turn.run.at]?.id ?? "",
              code: "interrupted",
              message: "This was interrupted when the page was reloaded.",
            },
          },
        }
      : turn,
  );
  return { account: parsed.account, turns };
}

export function save(storage: KeyValueStore | null, saved: Saved): void {
  if (!storage) return;
  try {
    storage.setItem(STATE_KEY, JSON.stringify({ version: VERSION, ...saved }));
  } catch {
    // Storage may be full or switched off. The page carries on without it.
  }
}

export function forget(storage: KeyValueStore | null): void {
  try {
    storage?.removeItem(STATE_KEY);
  } catch {
    // Nothing to do: there was nothing we could reach to remove.
  }
}
