import { seeded } from "./random";
import type { Seat, SeatKind, SeatMap } from "./schema";

// The cabin: 24 rows of six, three either side of one aisle.

export const ROWS = 24;
export const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;
const FRONT_ROWS = [1, 2, 3];
/** The rows at the emergency exits, which have more room. */
const EXIT_ROWS = [10, 11];

export const SEAT_PRICES = { middle: 0, standard: 35, front: 90, legroom: 160 } as const;

export function seatKinds(row: number, letter: string): SeatKind[] {
  const kinds: SeatKind[] = [];
  if (letter === "A" || letter === "F") kinds.push("window");
  else if (letter === "C" || letter === "D") kinds.push("aisle");
  else kinds.push("middle");
  if (EXIT_ROWS.includes(row)) kinds.push("legroom");
  if (FRONT_ROWS.includes(row)) kinds.push("front");
  return kinds;
}

export function seatPrice(kinds: readonly SeatKind[]): number {
  if (kinds.includes("legroom")) return SEAT_PRICES.legroom;
  if (kinds.includes("front")) return SEAT_PRICES.front;
  return kinds.includes("middle") ? SEAT_PRICES.middle : SEAT_PRICES.standard;
}

/** The cabin of one flight, with the seats other passengers hold marked as taken. */
export function seatMapOf(flightId: string): SeatMap {
  const next = seeded(`cabin:${flightId}`);
  const rows = Array.from({ length: ROWS }, (_unused, index) => {
    const row = index + 1;
    return {
      row,
      exit: EXIT_ROWS.includes(row),
      seats: LETTERS.map((letter): Seat => {
        const kinds = seatKinds(row, letter);
        return { id: `${row}${letter}`, row, letter, kinds, price: seatPrice(kinds), taken: next() < 0.48 };
      }),
    };
  });

  // A full row of taken windows would make "a window seat, please" impossible.
  // Keep one of each wish free, whatever the dice said.
  for (const kind of ["window", "aisle", "legroom", "front"] as const) {
    const ofKind = rows.flatMap((row) => row.seats).filter((seat) => seat.kinds.includes(kind));
    if (ofKind.every((seat) => seat.taken)) ofKind[Math.floor(next() * ofKind.length)].taken = false;
  }

  return { flightId, letters: [...LETTERS], aisleAfter: 3, rows };
}

export function findSeat(map: SeatMap, id: string): Seat | null {
  for (const row of map.rows) for (const seat of row.seats) if (seat.id === id.toUpperCase()) return seat;
  return null;
}

/** "an aisle seat", "a window seat with extra legroom" */
export function seatPhrase(kinds: readonly SeatKind[]): string {
  const side = kinds.find((kind) => kind === "window" || kind === "aisle" || kind === "middle") ?? "plain";
  const extra = kinds.includes("legroom") ? " with extra legroom" : kinds.includes("front") ? " at the front" : "";
  return `${side === "aisle" ? "an" : "a"} ${side} seat${extra}`;
}

/** "window", "aisle with extra legroom", "middle at the front" */
export function describeSeat(kinds: readonly SeatKind[]): string {
  const side = kinds.find((kind) => kind === "window" || kind === "aisle" || kind === "middle") ?? "seat";
  if (kinds.includes("legroom")) return `${side} with extra legroom`;
  if (kinds.includes("front")) return `${side} at the front`;
  return side;
}
