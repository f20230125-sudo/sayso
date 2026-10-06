// Calendar days as plain "2026-10-15" text.
//
// A day is not a moment: "Thursday the 15th" is the same day for the server in
// one time zone and the visitor in another. Keeping days as text, and doing
// the arithmetic in UTC, means a day can never slip by one on the way.

export type IsoDate = string;

const DAY_MS = 86_400_000;

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;
export const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const time = Date.parse(`${text}T00:00:00Z`);
  return !Number.isNaN(time) && new Date(time).toISOString().slice(0, 10) === text;
}

function toUtc(day: IsoDate): number {
  return Date.parse(`${day}T00:00:00Z`);
}

export function isoDate(year: number, month: number, dayOfMonth: number): IsoDate {
  return new Date(Date.UTC(year, month - 1, dayOfMonth)).toISOString().slice(0, 10);
}

/** The visitor's own calendar day at this moment. */
export function localDay(moment: Date): IsoDate {
  return isoDate(moment.getFullYear(), moment.getMonth() + 1, moment.getDate());
}

export function addDays(day: IsoDate, count: number): IsoDate {
  return new Date(toUtc(day) + count * DAY_MS).toISOString().slice(0, 10);
}

/** How many days from `from` to `to`. Negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY_MS);
}

/** 0 for Sunday up to 6 for Saturday. */
export function weekdayOf(day: IsoDate): number {
  return new Date(toUtc(day)).getUTCDay();
}

export function partsOf(day: IsoDate): { year: number; month: number; dayOfMonth: number } {
  const [year, month, dayOfMonth] = day.split("-").map(Number);
  return { year, month, dayOfMonth };
}

/** The first day on or after `day` that falls on `weekday`. */
export function nextWeekday(day: IsoDate, weekday: number): IsoDate {
  return addDays(day, (weekday - weekdayOf(day) + 7) % 7);
}

/** The Monday of the week `day` is in. Weeks run Monday to Sunday. */
export function mondayOf(day: IsoDate): IsoDate {
  return addDays(day, -((weekdayOf(day) + 6) % 7));
}

/** "Thu 15 Oct" */
export function shortDay(day: IsoDate): string {
  const { month, dayOfMonth } = partsOf(day);
  return `${WEEKDAYS[weekdayOf(day)].slice(0, 3)} ${dayOfMonth} ${MONTHS[month - 1].slice(0, 3)}`;
}

/** "Thursday 15 October" */
export function longDay(day: IsoDate): string {
  const { month, dayOfMonth } = partsOf(day);
  return `${WEEKDAYS[weekdayOf(day)]} ${dayOfMonth} ${MONTHS[month - 1]}`;
}

/** "today", "tomorrow", or the short day. */
export function relativeDay(day: IsoDate, today: IsoDate): string {
  const gap = daysBetween(today, day);
  if (gap === 0) return "today";
  if (gap === 1) return "tomorrow";
  return shortDay(day);
}

/** "7h 45m" */
export function duration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** Minutes since midnight as "08:05". */
export function clock(minutes: number): string {
  const inDay = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(inDay / 60)).padStart(2, "0")}:${String(inDay % 60).padStart(2, "0")}`;
}

export function minutesOf(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}
