import { MONTHS, WEEKDAYS, addDays, isoDate, isIsoDate, mondayOf, nextWeekday, partsOf, weekdayOf, type IsoDate } from "@/airline/dates";
import type { DateWish } from "../types";

// Finding the dates in a sentence: "next week", "Thursday", "15 Oct",
// "two days later". Each one found says where it sits in the sentence, so the
// rules can tell "my Thursday flight" (which trip) from "to Thursday" (when).

export type FoundDate = {
  index: number;
  length: number;
  wish: DateWish;
  /** Set when the words named a day of the week, which can also pick out a trip. */
  weekday?: number;
};

const NUMBER_WORDS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  couple: 2,
};

/** "two", "2", "a" as a number, or null. */
export function numberFrom(word: string): number | null {
  const lower = word.toLowerCase();
  if (/^\d{1,3}$/.test(lower)) return Number(lower);
  return NUMBER_WORDS[lower] ?? null;
}

const COUNT = "(\\d{1,2}|a|an|one|two|three|four|five|six|seven|eight|nine|ten|a couple of|couple of)";
const WEEKDAY = "(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues|tue|wed|thurs|thur|thu|fri|sat)";
const MONTH = "(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|oct|nov|dec)";

const day = (date: IsoDate): DateWish => ({ from: date, to: date });

function weekdayIndex(word: string): number {
  return WEEKDAYS.findIndex((name) => name.toLowerCase().startsWith(word.slice(0, 3)));
}

function monthIndex(word: string): number {
  return MONTHS.findIndex((name) => name.toLowerCase().startsWith(word.slice(0, 3)));
}

/** The next time this day and month come round, today included. */
function comingDate(today: IsoDate, month: number, dayOfMonth: number): IsoDate | null {
  const { year } = partsOf(today);
  for (const candidate of [isoDate(year, month, dayOfMonth), isoDate(year + 1, month, dayOfMonth)]) {
    // isoDate rolls 31 June into July; a date that does not survive the trip is not a real one.
    if (partsOf(candidate).dayOfMonth === dayOfMonth && candidate >= today) return candidate;
  }
  return null;
}

function countOf(text: string): number {
  return numberFrom(text.replace(/\s+of$/, "").replace(/^a couple$/, "couple").split(" ").pop() ?? "") ?? 1;
}

type Rule = { pattern: RegExp; read: (match: RegExpExecArray, today: IsoDate) => Omit<FoundDate, "index" | "length"> | null };

// Tried in this order. Where two overlap, the earlier rule wins, so the longer
// phrases come first: "day after tomorrow" before "tomorrow".
const RULES: Rule[] = [
  {
    pattern: /\b(\d{4})-(\d{2})-(\d{2})\b/g,
    read: (match) => (isIsoDate(match[0]) ? { wish: day(match[0]) } : null),
  },
  {
    // "two days later", "a week earlier"
    pattern: new RegExp(`\\b${COUNT} (day|week)s? (later|after|earlier|sooner|before)\\b`, "g"),
    read: (match) => {
      const size = countOf(match[1]) * (match[2] === "week" ? 7 : 1);
      return { wish: { shiftDays: /later|after/.test(match[3]) ? size : -size } };
    },
  },
  {
    // "push it back a week", "bring it forward two days"
    pattern: new RegExp(`\\b(back|forward) (?:by )?${COUNT} (day|week)s?\\b`, "g"),
    read: (match) => {
      const size = countOf(match[2]) * (match[3] === "week" ? 7 : 1);
      return { wish: { shiftDays: match[1] === "back" ? size : -size } };
    },
  },
  {
    // "delay it by a week": with no "forward", by so much means later
    pattern: new RegExp(`\\bby ${COUNT} (day|week)s?\\b`, "g"),
    read: (match) => ({ wish: { shiftDays: countOf(match[1]) * (match[2] === "week" ? 7 : 1) } }),
  },
  {
    // "in three days", "in a week"
    pattern: new RegExp(`\\bin ${COUNT} (day|week)s?\\b`, "g"),
    read: (match, today) => ({ wish: day(addDays(today, countOf(match[1]) * (match[2] === "week" ? 7 : 1))) }),
  },
  { pattern: /\bday after tomorrow\b/g, read: (_match, today) => ({ wish: day(addDays(today, 2)) }) },
  { pattern: /\btomorrow\b/g, read: (_match, today) => ({ wish: day(addDays(today, 1)) }) },
  { pattern: /\b(today|tonight)\b/g, read: (_match, today) => ({ wish: day(today) }) },
  {
    pattern: /\bnext week\b/g,
    read: (_match, today) => {
      const monday = addDays(mondayOf(today), 7);
      return { wish: { from: monday, to: addDays(monday, 6) } };
    },
  },
  {
    pattern: /\bthis week\b/g,
    read: (_match, today) => ({ wish: { from: today, to: addDays(mondayOf(today), 6) } }),
  },
  {
    pattern: /\b(this |next |the )?weekend\b/g,
    read: (match, today) => {
      const saturday = addDays(nextWeekday(today, 6), match[1] === "next " ? 7 : 0);
      return { wish: { from: saturday, to: addDays(saturday, 1) } };
    },
  },
  {
    pattern: /\bnext month\b/g,
    read: (_match, today) => {
      const { year, month } = partsOf(today);
      return { wish: { from: isoDate(year, month + 1, 1), to: isoDate(year, month + 2, 0) } };
    },
  },
  {
    // "15 Oct", "15th of October"
    pattern: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?(?: of)? ${MONTH}\\b`, "g"),
    read: (match, today) => {
      const date = comingDate(today, monthIndex(match[2]) + 1, Number(match[1]));
      return date ? { wish: day(date) } : null;
    },
  },
  {
    // "Oct 15", "October 15th"
    pattern: new RegExp(`\\b${MONTH} (\\d{1,2})(?:st|nd|rd|th)?\\b`, "g"),
    read: (match, today) => {
      const date = comingDate(today, monthIndex(match[1]) + 1, Number(match[2]));
      return date ? { wish: day(date) } : null;
    },
  },
  {
    // "the 15th": the next 15th to come round
    pattern: /\bthe (\d{1,2})(?:st|nd|rd|th)\b/g,
    read: (match, today) => {
      const { year, month } = partsOf(today);
      const wanted = Number(match[1]);
      for (let ahead = 0; ahead < 3; ahead += 1) {
        const candidate = isoDate(year, month + ahead, wanted);
        if (partsOf(candidate).dayOfMonth === wanted && candidate >= today) return { wish: day(candidate) };
      }
      return null;
    },
  },
  {
    // "Thursday", "next Friday". Plain "Thursday" is the next one to come,
    // never today. "next Friday" is the Friday of the week after this one.
    pattern: new RegExp(`\\b(next |this |on |coming )?${WEEKDAY}\\b`, "g"),
    read: (match, today) => {
      const weekday = weekdayIndex(match[2]);
      if (weekday === -1) return null;
      const date = match[1] === "next " ? nextWeekday(addDays(mondayOf(today), 7), weekday) : nextWeekday(addDays(today, 1), weekday);
      return { wish: day(date), weekday };
    },
  },
];

/** Every date in the text, in the order they appear. `text` is expected in lower case. */
export function findDates(text: string, today: IsoDate): FoundDate[] {
  const found: FoundDate[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    for (let match = rule.pattern.exec(text); match; match = rule.pattern.exec(text)) {
      const index = match.index;
      const length = match[0].length;
      if (found.some((other) => index < other.index + other.length && other.index < index + length)) continue;
      const read = rule.read(match, today);
      if (read) found.push({ index, length, ...read });
    }
  }
  return found.sort((a, b) => a.index - b.index);
}

/** Whether a wish for a day is already in the past. A shift has no fixed day, so it never is. */
export function isPast(wish: DateWish, today: IsoDate): boolean {
  return "to" in wish && wish.to < today;
}

/** The day of the week of a one-day wish, or null for a range or a shift. */
export function weekdayOfWish(wish: DateWish): number | null {
  return "from" in wish && wish.from === wish.to ? weekdayOf(wish.from) : null;
}
