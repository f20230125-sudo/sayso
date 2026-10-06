import { isIsoDate } from "@/airline/dates";
import { flightsOn } from "@/airline/flights";
import { CACHE_BRIEFLY, fail } from "@/airline/http";
import { destinationOf } from "@/airline/places";

/** GET /api/flights?from=DXB&to=LHR&date=2026-10-15: every flight on that route that day. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const from = (query.get("from") ?? "").toUpperCase();
  const to = (query.get("to") ?? "").toUpperCase();
  const date = query.get("date") ?? "";

  if (!isIsoDate(date)) return fail(400, "bad_date", "Give the date as year-month-day, such as 2026-10-15.");
  if (!destinationOf(from, to)) return fail(404, "no_such_route", `Juno Air does not fly between ${from || "?"} and ${to || "?"}.`);

  return Response.json({ flights: flightsOn(from, to, date) }, { headers: CACHE_BRIEFLY });
}
