// How one step of a plan points at what an earlier step produced.
//
// A plan is plain data. Where a step needs a value that is only known once the
// plan is running (the seat the visitor picked, the price the API quoted), it
// holds a reference instead: "{{seat.seat}}" or "{{quote.total}}". The first
// word is the id of the step that produced the value; the rest is a path into
// it. A reference is only ever looked up, never run as code.

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/** Everything the steps so far have produced, by step id. */
export type Scope = Record<string, Json>;

export class MissingReference extends Error {
  readonly path: string;

  constructor(path: string) {
    super(`Nothing has produced "${path}" yet.`);
    this.name = "MissingReference";
    this.path = path;
  }
}

const WHOLE = /^\{\{\s*([^{}]+?)\s*\}\}$/;
const WITHIN = /\{\{\s*([^{}]+?)\s*\}\}/g;

/** Split "flights.flights[0].id" into its steps: flights, flights, 0, id. */
function segments(path: string): (string | number)[] {
  const parts: (string | number)[] = [];
  for (const piece of path.split(".")) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(piece.trim());
    if (!match) throw new MissingReference(path);
    if (match[1] !== "") parts.push(match[1]);
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) parts.push(Number(index[1]));
  }
  return parts;
}

/** The value at a path, or undefined when the path leads nowhere. */
export function lookup(scope: Scope, path: string): Json | undefined {
  let current: Json | undefined = scope;
  for (const part of segments(path)) {
    if (current === null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      if (typeof part !== "number") return undefined;
      current = current[part];
    } else {
      if (!Object.prototype.hasOwnProperty.call(current, part)) return undefined;
      current = current[String(part)];
    }
  }
  return current;
}

function asText(value: Json): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Replace every reference in a value with what it points at, however deep it
 * sits. A string that is nothing but one reference becomes the value itself,
 * so a number stays a number and an object stays an object. A reference
 * inside a longer string is written into the text.
 */
export function fill(value: Json, scope: Scope): Json {
  if (typeof value === "string") {
    const whole = WHOLE.exec(value);
    if (whole) {
      const found = lookup(scope, whole[1]);
      if (found === undefined) throw new MissingReference(whole[1]);
      return found;
    }
    return value.replace(WITHIN, (_match, path: string) => {
      const found = lookup(scope, path);
      if (found === undefined) throw new MissingReference(path);
      return asText(found);
    });
  }
  if (Array.isArray(value)) return value.map((entry) => fill(entry, scope));
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, fill(entry, scope)]));
  }
  return value;
}

/** The ids of the steps a value refers to. Used to check a plan before it runs. */
export function referencedSteps(value: Json): string[] {
  const found = new Set<string>();
  const visit = (entry: Json) => {
    if (typeof entry === "string") {
      for (const match of entry.matchAll(WITHIN)) found.add(String(segments(match[1])[0]));
    } else if (Array.isArray(entry)) entry.forEach(visit);
    else if (entry !== null && typeof entry === "object") Object.values(entry).forEach(visit);
  };
  visit(value);
  return [...found];
}
