import type { ApiError } from "./schema";

// How every route answers when it cannot do what was asked: a status code and
// { error: { code, message } }, with a message fit to show to a person.

export function fail(status: number, code: string, message: string): Response {
  return Response.json({ error: { code, message } } satisfies ApiError, { status });
}

/** Timetable answers never change for the same question, so browsers may keep them a while. */
export const CACHE_BRIEFLY = { "Cache-Control": "public, max-age=60" };
