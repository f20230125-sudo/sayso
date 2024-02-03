import { findFlight } from "@/airline/flights";
import { fail } from "@/airline/http";
import { statusOf } from "@/airline/status";

/**
 * GET /api/flights/:id/status?at=2026-10-06T10:30:00Z: where one flight
 * stands at a moment. Without `at`, the moment is now.
 */
export async function GET(request: Request, context: RouteContext<"/api/flights/[id]/status">) {
  const { id } = await context.params;
  const flight = findFlight(id);
  if (!flight) return fail(404, "no_such_flight", `There is no flight ${id}.`);

  const asked = new URL(request.url).searchParams.get("at");
  const at = asked ? new Date(asked) : new Date();
  if (Number.isNaN(at.getTime())) return fail(400, "bad_time", "Give the moment as a date and time, such as 2026-10-06T10:30:00Z.");

  return Response.json(statusOf(flight, at));
}
