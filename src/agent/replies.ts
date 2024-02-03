import { upcoming } from "@/airline/account";
import type { IsoDate } from "@/airline/dates";
import type { Account } from "@/airline/schema";
import { isCheckInOpen } from "@/airline/status";
import type { Understanding } from "./types";

// The plain lines the desk says when there is nothing to show.

export const CAN_DO =
  "I can show your trips and a flight's status, move a flight, choose a seat, add bags, check you in, cancel a booking, or book a new flight.";

export function chatReply(about: Extract<Understanding, { kind: "chat" }>["about"]): string {
  switch (about) {
    case "hello":
      return "Hello. Say what you need and I will bring up the right screen for it.";
    case "thanks":
      return "You are welcome.";
    case "help":
      return `${CAN_DO} Say it in your own words, and say several at once if you like.`;
  }
}

export const NOT_UNDERSTOOD = `I did not understand that. ${CAN_DO}`;
export const NOTHING_IN_PROGRESS = "There is nothing in progress to answer. Say what you need.";
export const NOT_UNDERSTOOD_WHILE_WAITING = 'I did not understand that. Choose on the screen above, or say "never mind" to leave it.';
export const ALREADY_SO = "That is already how it is set.";
export const LEFT_UNFINISHED = "Left unfinished. Nothing was changed.";
export const STOPPED = "Stopped. Nothing was changed.";

/** Things to try, written from the traveller's own trips so every one of them works. */
export function suggestions(account: Account, today: IsoDate, now: Date): string[] {
  const trips = upcoming(account, today);
  // Not the very next flight: the one after it is far enough off to change freely.
  const later = trips[1] ?? trips[0];
  const tries: string[] = [];
  if (later) tries.push(`Move my ${later.flight.toCity} flight to next week, window seat, and add a bag`);
  const open = trips.find((trip) => !trip.checkedIn && isCheckInOpen(trip.flight, now));
  if (open) tries.push(`Check me in for ${open.flight.toCity}`);
  if (trips.length > 0) tries.push("Is my flight on time?");
  tries.push("Book a flight to Paris next Friday");
  if (trips.length > 0) tries.push("Show my trips");
  return tries;
}
