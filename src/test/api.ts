import { GET as catalogue } from "@/app/api/catalog/route";
import { GET as calendar } from "@/app/api/flights/calendar/route";
import { GET as flights } from "@/app/api/flights/route";
import { GET as seats } from "@/app/api/flights/[id]/seats/route";
import { GET as status } from "@/app/api/flights/[id]/status/route";
import { GET as health } from "@/app/api/health/route";
import { POST as orders } from "@/app/api/orders/route";
import { POST as quotes } from "@/app/api/quotes/route";
import { demoAccount } from "@/airline/account";
import type { Booking, Seat } from "@/airline/schema";
import { seatMapOf } from "@/airline/seats";

// A stand-in for the network in tests. Requests never leave the process:
// they are handed straight to the real route handlers, so a test of the agent
// or the store also exercises the routes it depends on.

export const TODAY = "2026-10-06"; // a Tuesday
/** 10:30 that morning, in Dubai. */
export const NOW = new Date("2026-10-06T10:30:00+04:00");

export type Seen = { method: string; path: string; body: unknown }[];

type Options = {
  /** Every request made, in order. */
  seen?: Seen;
  /** Answer for a path before the routes do. Return null to let the routes answer. */
  intercept?: (path: string, request: Request) => Response | Promise<Response> | null;
};

export function apiFetch({ seen, intercept }: Options = {}): typeof fetch {
  return async (input, init) => {
    const request = new Request(new URL(String(input), "http://sayso.test"), init);
    const url = new URL(request.url);
    const path = url.pathname + url.search;
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    seen?.push({ method: request.method, path, body });

    // An aborted request never reaches a real server either.
    if (request.signal.aborted) throw new DOMException("The request was stopped.", "AbortError");

    // A real request that is stopped fails at once, however long the answer would have taken.
    const stopped = new Promise<never>((_resolve, reject) => {
      request.signal.addEventListener("abort", () => reject(new DOMException("The request was stopped.", "AbortError")), { once: true });
    });
    // Once an answer has come, a later stop has nobody left to tell.
    stopped.catch(() => {});
    const early = await Promise.race([Promise.resolve(intercept?.(path, request)), stopped]);
    if (early) return early;

    const seatsOf = /^\/api\/flights\/([^/]+)\/seats$/.exec(url.pathname);
    if (seatsOf) return seats(request, { params: Promise.resolve({ id: decodeURIComponent(seatsOf[1]) }) });
    const statusOf = /^\/api\/flights\/([^/]+)\/status$/.exec(url.pathname);
    if (statusOf) return status(request, { params: Promise.resolve({ id: decodeURIComponent(statusOf[1]) }) });
    if (url.pathname === "/api/flights/calendar") return calendar(request);
    if (url.pathname === "/api/flights") return flights(request);
    if (url.pathname === "/api/quotes") return quotes(request);
    if (url.pathname === "/api/orders") return orders(request);
    if (url.pathname === "/api/health") return health();
    if (url.pathname === "/api/catalog") return catalogue();
    return Response.json({ error: { code: "not_found", message: "No such route." } }, { status: 404 });
  };
}

export const account = () => demoAccount(TODAY);

export function trip(place: string): Booking {
  const found = account().bookings.find((booking) => booking.flight.to === place);
  if (!found) throw new Error(`The demo account has no trip to ${place}.`);
  return found;
}

/** A free seat of exactly one kind on a booking's flight, not the one already held. */
export function freeSeat(booking: Booking, kind: "window" | "aisle" | "middle"): Seat {
  const seat = seatMapOf(booking.flight.id)
    .rows.flatMap((row) => row.seats)
    .find((entry) => !entry.taken && entry.id !== booking.seat && entry.kinds.length === 1 && entry.kinds[0] === kind);
  if (!seat) throw new Error(`No free ${kind} seat.`);
  return seat;
}

export function takenSeat(booking: Booking): Seat {
  const seat = seatMapOf(booking.flight.id)
    .rows.flatMap((row) => row.seats)
    .find((entry) => entry.taken && entry.id !== booking.seat);
  if (!seat) throw new Error("No taken seat.");
  return seat;
}

/** Browser storage that lives in memory. */
export function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
    data,
  };
}
