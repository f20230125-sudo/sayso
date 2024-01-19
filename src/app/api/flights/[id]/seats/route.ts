import { findFlight } from "@/airline/flights";
import { CACHE_BRIEFLY, fail } from "@/airline/http";
import { seatMapOf } from "@/airline/seats";

/** GET /api/flights/:id/seats: the cabin of one flight, with taken seats marked. */
export async function GET(_request: Request, context: RouteContext<"/api/flights/[id]/seats">) {
  const { id } = await context.params;
  const flight = findFlight(id);
  if (!flight) return fail(404, "no_such_flight", `There is no flight ${id}.`);
  return Response.json(seatMapOf(flight.id), { headers: CACHE_BRIEFLY });
}
