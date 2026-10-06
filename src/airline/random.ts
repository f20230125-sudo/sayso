// Numbers that look random but are the same every time for the same text.
//
// The airline has no database. A flight's price, its free seats and its gate
// are all worked out from its own name and date, so every server and every
// visitor sees the same flight without anything being stored.

/** A whole number from a piece of text (FNV-1a, 32 bits). */
export function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

export type Next = () => number;

/** A stream of numbers from 0 up to (not including) 1, decided by the seed (mulberry32). */
export function seeded(seed: string): Next {
  let state = hash(seed);
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole number from min to max, both included. */
export function between(next: Next, min: number, max: number): number {
  return min + Math.floor(next() * (max - min + 1));
}

export function pick<T>(next: Next, items: readonly T[]): T {
  return items[Math.floor(next() * items.length)];
}

const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** A short code such as a booking reference: no 0, O, 1 or I, which people misread. */
export function code(next: Next, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) text += CODE_LETTERS[Math.floor(next() * CODE_LETTERS.length)];
  return text;
}
