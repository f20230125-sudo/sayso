import { describe, expect, it } from "vitest";
import { apiFetch, trip } from "@/test/api";
import { departureMoment, flightsOn } from "./flights";
import { apiErrorSchema, flightStatusSchema } from "./schema";
import { checkInOpens, isCheckInOpen, localAt, statusOf } from "./status";

const MINUTE = 60_000;
const mumbai = trip("BOM").flight;
/** A moment so many minutes before the flight is due to leave. */
const before = (minutes: number) => new Date(departureMoment(mumbai).getTime() - minutes * MINUTE);

describe("flight status", () => {
  it("is valid at any moment, and the same every time it is asked", () => {
    for (const minutes of [5000, 2000, 50, 45, 30, -10, -600]) {
      const status = statusOf(mumbai, before(minutes));
      expect(flightStatusSchema.safeParse(status).success).toBe(true);
      expect(status).toEqual(statusOf(mumbai, before(minutes)));
    }
  });

  it("moves through its phases as the time comes", () => {
    const delay = statusOf(mumbai, before(5000)).delayMinutes;
    const phase = (minutes: number) => statusOf(mumbai, before(minutes - delay)).phase;
    expect(statusOf(mumbai, before(48 * 60 + 1)).phase).toBe("scheduled");
    expect(statusOf(mumbai, before(48 * 60)).phase).toBe("check-in");
    expect(phase(61)).toBe("check-in");
    expect(phase(59)).toBe("closing");
    expect(phase(39)).toBe("boarding");
    expect(phase(-1)).toBe("departed");
    expect(phase(-mumbai.minutes - 1)).toBe("landed");
  });

  it("marks each step as done, next or later", () => {
    const states = (minutes: number) => statusOf(mumbai, before(minutes)).steps.map((step) => step.state);
    expect(states(5000)).toEqual(["next", "later", "later", "later", "later"]);
    expect(states(600)).toEqual(["done", "next", "later", "later", "later"]);
    expect(states(-100000)).toEqual(["done", "done", "done", "done", "done"]);
  });

  it("shows the gate only in the last three hours", () => {
    expect(statusOf(mumbai, before(181))).toMatchObject({ gate: null, walkMinutes: null });
    const near = statusOf(mumbai, before(179));
    expect(near.gate).toMatch(/^[A-D]\d{1,2}$/);
    expect(near.walkMinutes).toBeGreaterThanOrEqual(3);
  });

  it("gives each step in the local time of the airport it happens at", () => {
    const status = statusOf(mumbai, before(600));
    const leaves = status.steps.find((step) => step.key === "departure")!;
    const lands = status.steps.find((step) => step.key === "arrival")!;
    if (status.delayMinutes === 0) {
      expect([leaves.date, leaves.time]).toEqual([mumbai.date, mumbai.departs]);
      expect(lands.time).toBe(mumbai.arrives);
    }
    expect(localAt(new Date("2026-10-06T22:30:00Z"), "DXB")).toEqual({ date: "2026-10-07", time: "02:30" });
    expect(localAt(new Date("2026-10-06T02:00:00Z"), "JFK")).toEqual({ date: "2026-10-05", time: "21:00" });
  });

  it("some flights run late, and say so", () => {
    const all = ["LHR", "CDG", "IST", "BOM", "SIN", "JFK"].flatMap((place) => flightsOn("DXB", place, "2026-11-03"));
    const late = all.filter((flight) => statusOf(flight, new Date("2026-11-01T00:00:00Z")).delayMinutes > 0);
    expect(late.length).toBeGreaterThan(0);
    expect(late.length).toBeLessThan(all.length);
    const status = statusOf(late[0], new Date("2026-11-01T00:00:00Z"));
    expect(status.headline).toBe(`scheduled, ${status.delayMinutes} minutes late`);
    expect(status.delayMinutes % 5).toBe(0);
  });

  it("opens check-in 48 hours before, and closes it an hour before", () => {
    expect(checkInOpens(mumbai).getTime()).toBe(departureMoment(mumbai).getTime() - 48 * 60 * MINUTE);
    expect(isCheckInOpen(mumbai, before(48 * 60 + 1))).toBe(false);
    expect(isCheckInOpen(mumbai, before(48 * 60))).toBe(true);
    expect(isCheckInOpen(mumbai, before(61))).toBe(true);
    expect(isCheckInOpen(mumbai, before(60))).toBe(false);
  });
});

describe("the REST routes", () => {
  const api = apiFetch();
  const get = async (path: string) => {
    const response = await api(path);
    return { status: response.status, body: (await response.json()) as unknown, cache: response.headers.get("cache-control") };
  };
  const post = async (path: string, body: unknown) => {
    const response = await api(path, { method: "POST", body: JSON.stringify(body) });
    return { status: response.status, body: (await response.json()) as unknown };
  };
  const refused = (code: string) => ({ error: { code } });

  it("answers health", async () => {
    expect(await get("/api/health")).toMatchObject({ status: 200, body: { status: "ok" } });
  });

  it("lists flights, and says plainly what is wrong with a bad question", async () => {
    expect(await get("/api/flights?from=dxb&to=lhr&date=2026-10-15")).toMatchObject({ status: 200, body: { flights: flightsOn("DXB", "LHR", "2026-10-15") }, cache: "public, max-age=60" });
    expect(await get("/api/flights?from=DXB&to=LHR&date=tomorrow")).toMatchObject({ status: 400, body: refused("bad_date") });
    expect(await get("/api/flights?from=LHR&to=CDG&date=2026-10-15")).toMatchObject({ status: 404, body: refused("no_such_route") });
    const failure = await get("/api/flights?date=2026-10-15");
    expect(apiErrorSchema.safeParse(failure.body).success).toBe(true);
  });

  it("gives the calendar for up to a month", async () => {
    expect(await get("/api/flights/calendar?from=DXB&to=IST&start=2026-10-12&days=7")).toMatchObject({ status: 200, body: { days: { length: 7 } } });
    expect(await get("/api/flights/calendar?from=DXB&to=IST&start=2026-10-12")).toMatchObject({ body: { days: { length: 14 } } });
    expect(await get("/api/flights/calendar?from=DXB&to=IST&start=2026-10-12&days=90")).toMatchObject({ status: 400, body: refused("bad_days") });
    expect(await get("/api/flights/calendar?from=DXB&to=IST&start=soon")).toMatchObject({ status: 400, body: refused("bad_date") });
    expect(await get("/api/flights/calendar?from=DXB&to=XXX&start=2026-10-12")).toMatchObject({ status: 404, body: refused("no_such_route") });
  });

  it("gives a flight's seats and status, or says there is no such flight", async () => {
    expect(await get(`/api/flights/${mumbai.id}/seats`)).toMatchObject({ status: 200, body: { flightId: mumbai.id } });
    expect(await get("/api/flights/JN999_2026-10-15/seats")).toMatchObject({ status: 404, body: refused("no_such_flight") });
    expect(await get(`/api/flights/${mumbai.id}/status?at=${encodeURIComponent(before(600).toISOString())}`)).toMatchObject({ status: 200, body: { phase: "check-in" } });
    expect(await get(`/api/flights/${mumbai.id}/status?at=yesterday`)).toMatchObject({ status: 400, body: refused("bad_time") });
    expect(await get("/api/flights/nope/status")).toMatchObject({ status: 404, body: refused("no_such_flight") });
  });

  it("prices and places orders, refusing what is not in the expected shape", async () => {
    const booking = trip("IST");
    const changes = [{ type: "bags", count: 2 }];
    expect(await post("/api/quotes", { booking, changes })).toMatchObject({ status: 200, body: { total: 240 } });
    expect(await post("/api/quotes", { booking, changes: [] })).toMatchObject({ status: 400, body: refused("bad_request") });
    expect(await post("/api/quotes", { booking: { code: "x" }, changes })).toMatchObject({ status: 400, body: refused("bad_request") });
    expect(await post("/api/quotes", { booking, changes: [{ type: "upgrade" }] })).toMatchObject({ status: 400 });

    expect(await post("/api/orders", { booking, changes, expectedTotal: 240 })).toMatchObject({ status: 200, body: { booking: { bags: 2 }, receipt: { total: 240 } } });
    // A total changed in the browser changes nothing on the server.
    expect(await post("/api/orders", { booking, changes, expectedTotal: 1 })).toMatchObject({ status: 409, body: refused("price_changed") });
    expect(await post("/api/orders", { booking, changes })).toMatchObject({ status: 400, body: refused("bad_request") });
  });
});
