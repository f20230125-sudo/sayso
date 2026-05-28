import { fail } from "@/airline/http";
import { placeOrder } from "@/airline/pricing";
import { orderRequestSchema } from "@/airline/schema";

/**
 * POST /api/orders: carry out a list of changes to a booking.
 *
 * The server keeps no bookings: they live in the visitor's browser. So the
 * booking comes in with the request and its new state goes back in the answer.
 * The price is worked out again here and compared with `expectedTotal`, the
 * total the visitor agreed to. A different total is refused, never charged.
 *
 * Request:  { booking, changes, expectedTotal }
 * Answer:   200 { booking, receipt }
 *           4xx { error: { code, message } }
 */
export async function POST(request: Request) {
  const parsed = orderRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail(400, "bad_request", "The request is not in the expected shape.");

  // The end-to-end tests fix the visitor's clock at one day. The server has to agree, or a payment
  // would be dated a day the page has not reached yet. SAYSO_NOW is set only by those tests.
  const now = process.env.SAYSO_NOW ? new Date(process.env.SAYSO_NOW) : new Date();
  const placed = placeOrder(parsed.data.booking, parsed.data.changes, parsed.data.expectedTotal, now);
  if (!placed.ok) return fail(placed.status, placed.code, placed.message);
  return Response.json(placed.result);
}
