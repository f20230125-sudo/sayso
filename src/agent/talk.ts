import { upcoming } from "@/airline/account";
import { shortDay } from "@/airline/dates";
import { AIRLINE, DESTINATIONS } from "@/airline/places";
import { FEES, MAX_BAGS } from "@/airline/pricing";
import { SEAT_PRICES } from "@/airline/seats";
import { CAN_DO } from "./replies";
import type { Context } from "./types";

// Answering a question in words.
//
// Some things a traveller asks need no component: "what does a bag cost?",
// "can I bring a cat?". The airline's facts are written down once, here, from
// the same constants the pricing code uses, so the words cannot drift from
// what the desk would actually charge.
//
// The rules answer the commonest questions with the matching fact, word for
// word. With a model available, any other question is answered by the model,
// which is given these facts and told to answer from them alone. Such a reply
// is marked on the page as written by a model.

export const FACTS = {
  airline: `${AIRLINE.name} is a made-up airline for this demo. It flies between Dubai and ${DESTINATIONS.map((place) => place.city).join(", ")}. Every flight is direct.`,
  bags: `Each ticket includes one cabin bag of up to 7 kg. A checked bag is up to 23 kg and costs AED ${FEES.bag}. A booking can hold at most ${MAX_BAGS} checked bags.`,
  seats: `Choosing a seat costs AED ${SEAT_PRICES.standard} for a window or aisle seat, AED ${SEAT_PRICES.front} at the front, AED ${SEAT_PRICES.legroom} for extra legroom, and nothing for a middle seat.`,
  change: `Moving a booking to another flight on the same route costs a change fee of AED ${FEES.change} plus or minus the difference in fare. The seat does not move with the booking.`,
  cancel: `Cancelling a booking refunds what was paid, less a fee of AED ${FEES.cancel}.`,
  checkIn: "Online check-in opens 48 hours before a flight leaves and closes 1 hour before. A seat must be chosen before checking in.",
  airport: "Bag drop closes 1 hour before a flight leaves, boarding starts 40 minutes before, and the gate is shown 3 hours before.",
  cannot: "Pets, special meals, upgrades and lounge access are not something this desk can arrange.",
} as const;

export type FactName = keyof typeof FACTS;

/** What the model is told before the traveller's question. */
export function talkPrompt(context: Context): string {
  const trips = upcoming(context.account, context.today).map(
    (booking) => `${booking.flight.number} to ${booking.flight.toCity} on ${shortDay(booking.flight.date)} at ${booking.flight.departs}`,
  );
  return [
    `You are the service desk of ${AIRLINE.name}. Answer the traveller's question in one to three short, plain sentences.`,
    "Use only the facts below. If they do not cover the question, say that you do not know, in one sentence.",
    "No lists, no headings, no emphasis marks. Do not offer to do anything: only answer.",
    "",
    "FACTS:",
    ...Object.values(FACTS).map((fact) => `- ${fact}`),
    `- The traveller's upcoming trips: ${trips.length > 0 ? trips.join("; ") : "none"}.`,
    `- What the desk can do when asked: ${CAN_DO.replace(/^I can /, "")}`,
  ].join("\n");
}
