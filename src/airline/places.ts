// Where Juno Air flies. Juno Air is made up: every flight starts or ends at
// its home airport, Dubai.

export const AIRLINE = { name: "Juno Air", code: "JN" } as const;
export const HOME = "DXB";
export const CURRENCY = "AED";

export type Airport = {
  code: string;
  city: string;
  country: string;
  /** Hours ahead of UTC. Fixed all year, which is close enough for a demo. */
  utc: number;
  /** Other things people call the place. */
  alsoCalled: string[];
};

export type Destination = Airport & {
  /** Flying time from Dubai, in minutes. */
  minutes: number;
  /** A typical one-way fare from Dubai, in AED. */
  fare: number;
};

export const DUBAI: Airport = { code: "DXB", city: "Dubai", country: "United Arab Emirates", utc: 4, alsoCalled: ["dxb"] };

export const DESTINATIONS: readonly Destination[] = [
  { code: "LHR", city: "London", country: "United Kingdom", utc: 0, alsoCalled: ["heathrow", "lhr"], minutes: 465, fare: 1450 },
  { code: "CDG", city: "Paris", country: "France", utc: 1, alsoCalled: ["cdg"], minutes: 440, fare: 1380 },
  { code: "FRA", city: "Frankfurt", country: "Germany", utc: 1, alsoCalled: ["fra"], minutes: 420, fare: 1320 },
  { code: "IST", city: "Istanbul", country: "Türkiye", utc: 3, alsoCalled: ["ist"], minutes: 290, fare: 890 },
  { code: "CAI", city: "Cairo", country: "Egypt", utc: 2, alsoCalled: ["cai"], minutes: 245, fare: 780 },
  { code: "BOM", city: "Mumbai", country: "India", utc: 5.5, alsoCalled: ["bombay", "bom"], minutes: 195, fare: 620 },
  { code: "DEL", city: "Delhi", country: "India", utc: 5.5, alsoCalled: ["new delhi", "del"], minutes: 215, fare: 680 },
  { code: "SIN", city: "Singapore", country: "Singapore", utc: 8, alsoCalled: ["sin"], minutes: 445, fare: 1560 },
  { code: "BKK", city: "Bangkok", country: "Thailand", utc: 7, alsoCalled: ["bkk"], minutes: 375, fare: 1240 },
  { code: "JFK", city: "New York", country: "United States", utc: -5, alsoCalled: ["nyc", "new york city", "jfk"], minutes: 840, fare: 2950 },
  { code: "NBO", city: "Nairobi", country: "Kenya", utc: 3, alsoCalled: ["nbo"], minutes: 310, fare: 1090 },
];

const AIRPORTS = new Map<string, Airport>([[DUBAI.code, DUBAI], ...DESTINATIONS.map((place) => [place.code, place] as const)]);

export function airport(code: string): Airport | null {
  return AIRPORTS.get(code.toUpperCase()) ?? null;
}

export function cityOf(code: string): string {
  return airport(code)?.city ?? code;
}

/** The far end of a route, when exactly one end is Dubai. */
export function destinationOf(from: string, to: string): Destination | null {
  const a = from.toUpperCase();
  const b = to.toUpperCase();
  if (a === b || (a !== HOME && b !== HOME)) return null;
  return DESTINATIONS.find((place) => place.code === (a === HOME ? b : a)) ?? null;
}

/**
 * Find the places a sentence mentions, by city name, another name for it or
 * its three-letter code. Longer names are tried first so "New York City" is
 * not read as "New York" with "City" left over.
 */
export function placesIn(text: string): { code: string; index: number; length: number }[] {
  const lower = ` ${text.toLowerCase()} `;
  const names = [...AIRPORTS.values()]
    .flatMap((place) => [place.city.toLowerCase(), ...place.alsoCalled].map((name) => ({ name, code: place.code })))
    .sort((a, b) => b.name.length - a.name.length);

  const found: { code: string; index: number; length: number }[] = [];
  for (const { name, code } of names) {
    let from = 0;
    for (;;) {
      const at = lower.indexOf(name, from);
      if (at === -1) break;
      from = at + name.length;
      const before = lower[at - 1];
      const after = lower[at + name.length];
      if (/[a-z0-9]/.test(before) || /[a-z0-9]/.test(after)) continue;
      const index = at - 1; // undo the leading space
      if (found.some((other) => index < other.index + other.length && other.index < index + name.length)) continue;
      found.push({ code, index, length: name.length });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}
