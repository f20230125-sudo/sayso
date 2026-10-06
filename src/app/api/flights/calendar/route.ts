import { isIsoDate } from "@/airline/dates";
import { cheapestByDay } from "@/airline/flights";
import { CACHE_BRIEFLY, fail } from "@/airline/http";
import { destinationOf } from "@/airline/places";

const MAX_DAYS = 31;

/** GET /api/flights/calendar?from=DXB&to=LHR&start=2026-10-12&days=14: the cheapest fare on each day. */
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const from = (query.get("from") ?? "").toUpperCase();
  const to = (query.get("to") ?? "").toUpperCase();
  const start = query.get("start") ?? "";
  const days = Number(query.get("days") ?? "14");

  if (!isIsoDate(start)) return fail(400, "bad_date", "Give the first day as year-month-day, such as 2026-10-15.");
  if (!Number.isInteger(days) || days < 1 || days > MAX_DAYS) return fail(400, "bad_days", `Ask for between 1 and ${MAX_DAYS} days.`);
  if (!destinationOf(from, to)) return fail(404, "no_such_route", `Juno Air does not fly between ${from || "?"} and ${to || "?"}.`);

  return Response.json({ days: cheapestByDay(from, to, start, days) }, { headers: CACHE_BRIEFLY });
}
