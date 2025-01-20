import { upcoming } from "@/airline/account";
import type { IsoDate } from "@/airline/dates";
import type { Account } from "@/airline/schema";
import type { Understanding } from "./types";

// The plain lines the desk says when there is nothing to show.

export const CAN_DO = "I can show your trips and change your seat.";

export function chatReply(about: Extract<Understanding, { kind: "chat" }>["about"]): string {
  switch (about) {
    case "hello":
      return "Hello. Say what you need and I will bring up the right screen for it.";
    case "thanks":
      return "You are welcome.";
    case "help":
      return `${CAN_DO} Say it in your own words, such as "give me a window seat on my London flight".`;
  }
}

export const NOT_UNDERSTOOD = `I did not understand that. ${CAN_DO}`;
export const NOTHING_IN_PROGRESS = "There is nothing in progress to answer. Say what you need.";
export const NOT_UNDERSTOOD_WHILE_WAITING = 'I did not understand that. Choose on the screen above, or say "never mind" to leave it.';
export const ALREADY_SO = "That is already how it is set.";
export const LEFT_UNFINISHED = "Left unfinished. Nothing was changed.";
export const STOPPED = "Stopped. Nothing was changed.";

/** Things to try, written from the traveller's own trips so every one of them works. */
export function suggestions(account: Account, today: IsoDate): string[] {
  const trips = upcoming(account, today);
  // Not the very next flight: the one after it is far enough off to change freely.
  const later = trips[1] ?? trips[0];
  const tries = ["Show my trips"];
  if (later) tries.unshift(`Give me a window seat on my ${later.flight.toCity} flight`);
  if (trips.length > 1) tries.push("I want more legroom");
  return tries;
}
