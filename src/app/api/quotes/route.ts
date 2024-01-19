import { fail } from "@/airline/http";
import { quoteFor } from "@/airline/pricing";
import { quoteRequestSchema } from "@/airline/schema";

/**
 * POST /api/quotes: what a list of changes to a booking would cost.
 *
 * Request:  { booking, changes }     booking is null when the order books a new flight
 * Answer:   200 { lines, total, currency }
 *           4xx { error: { code, message } }
 */
export async function POST(request: Request) {
  const parsed = quoteRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "The request is not in the expected shape.");

  const priced = quoteFor(parsed.data.booking, parsed.data.changes);
  if (!priced.ok) return fail(priced.status, priced.code, priced.message);
  return Response.json(priced.quote);
}
