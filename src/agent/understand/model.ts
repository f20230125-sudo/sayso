import { z } from "zod";
import { upcoming } from "@/airline/account";
import { WEEKDAYS, addDays, mondayOf, shortDay, weekdayOf } from "@/airline/dates";
import { DESTINATIONS, DUBAI, airport } from "@/airline/places";
import { isoDateSchema, seatKindSchema, type Booking, type Flight } from "@/airline/schema";
import { VIEW_NAMES, type Context, type Intent, type Json, type TripRef, type Understanding } from "../types";
import { VIEW_NOTES } from "../views";

// The first of the four steps, done by a language model.
//
// The model is asked for one thing only: to say, as JSON, which of the desk's
// journeys the words ask for and with what details. It never writes what the
// traveller sees, and it never decides what happens next. Its reply is checked
// against a schema and against the account before it is believed: a journey
// that does not exist, a booking the traveller does not have or a date that is
// not a date is sent back once for repair, and after that the reply is dropped.

/** Sends messages to a model and returns its reply. The caller decides which model. */
export type Ask = (messages: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<string>;

const bookingCode = z.string().regex(/^[A-Z0-9]{4,8}$/);
const airportCode = z.string().regex(/^[A-Z]{3}$/);
const when = z.union([
  z.object({ from: isoDateSchema, to: isoDateSchema }).refine((range) => range.from <= range.to, "from must not be after to"),
  z.object({ shiftDays: z.number().int().min(-60).max(60) }),
]);

const intentSchema = z.discriminatedUnion("journey", [
  z.object({ journey: z.literal("trips") }),
  z.object({ journey: z.literal("status"), trip: bookingCode.optional() }),
  z.object({ journey: z.literal("change-flight"), trip: bookingCode.optional(), when: when.optional() }),
  z.object({ journey: z.literal("seat"), trip: bookingCode.optional(), wish: seatKindSchema.optional(), seat: z.string().regex(/^\d{1,2}[A-F]$/).optional() }),
  z.object({ journey: z.literal("bags"), trip: bookingCode.optional(), add: z.number().int().min(1).max(5).optional() }),
  z.object({ journey: z.literal("check-in"), trip: bookingCode.optional() }),
  z.object({ journey: z.literal("cancel"), trip: bookingCode.optional() }),
  z.object({ journey: z.literal("book"), from: airportCode.optional(), to: airportCode.optional(), when: when.optional() }),
  z.object({ journey: z.literal("insight"), views: z.array(z.enum(VIEW_NAMES)).min(1).max(3) }),
]);

const intents = z.array(intentSchema).min(1).max(5);

export const modelReplySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("request"), intents }),
  z.object({ kind: z.literal("amend"), intents }),
  z.object({ kind: z.literal("pick"), value: z.union([z.string(), z.number()]).transform(String) }),
  z.object({ kind: z.literal("abandon") }),
  z.object({ kind: z.literal("talk") }),
  z.object({ kind: z.literal("unknown") }),
]);
type ModelReply = z.infer<typeof modelReplySchema>;

function describeTrip(booking: Booking): string {
  const { flight } = booking;
  return [
    `${booking.code}: ${flight.number}, ${flight.fromCity} to ${flight.toCity}`,
    `${WEEKDAYS[weekdayOf(flight.date)].slice(0, 3)} ${flight.date} ${flight.departs}`,
    booking.seat ? `seat ${booking.seat}` : "no seat chosen",
    `${booking.bags} checked bag${booking.bags === 1 ? "" : "s"}`,
    booking.checkedIn ? "checked in" : "not checked in",
  ].join(", ");
}

/** What is on screen and can be chosen from, for the component that is waiting. */
function onScreen(active: NonNullable<Context["active"]>): string {
  const props = active.props as Record<string, unknown>;
  switch (active.widget) {
    case "trip-chooser":
      return `A list of trips to choose from. To choose one, pick its code:\n${(props.bookings as Booking[]).map(describeTrip).join("\n")}`;
    case "date-strip":
      return `A row of days to choose from. To choose one, pick its date: ${(props.days as { date: string; price: number }[])
        .map((day) => `${WEEKDAYS[weekdayOf(day.date)].slice(0, 3)} ${day.date} (from AED ${day.price})`)
        .join(", ")}`;
    case "flight-list":
      return `A list of flights to choose from. To choose one, pick its number:\n${(props.flights as Flight[])
        .map((flight) => `${flight.number}: leaves ${flight.departs}, lands ${flight.arrives}, AED ${flight.price}`)
        .join("\n")}`;
    case "bag-stepper":
      return 'A question: how many checked bags to add. To answer, pick the number, such as "2".';
    case "price-summary":
    case "refund":
    case "passenger-check":
      return 'A confirmation. If the traveller agrees, pick "yes".';
    case "seat-map":
      return "A seat map. A seat cannot be picked for them. If they want a different kind of seat, amend the seat journey.";
    case "flight-search":
      return "A form asking where and when to fly. If they say where or when, amend the book journey.";
    default:
      return "Nothing to choose from.";
  }
}

/** Everything the model is told before the traveller's words. */
export function systemPrompt(context: Context): string {
  const { today, account, active } = context;
  const days = Array.from({ length: 21 }, (_unused, index) => addDays(today, index));
  const nextMonday = addDays(mondayOf(today), 7);
  const trips = upcoming(account, today);

  return [
    "You turn what a traveller typed at an airline's service desk into one JSON object. Reply with the JSON object only.",
    "",
    `TODAY: ${WEEKDAYS[weekdayOf(today)]} ${today}`,
    `CALENDAR: ${days.map((day) => `${WEEKDAYS[weekdayOf(day)].slice(0, 3)} ${day}`).join(", ")}`,
    `Weeks run Monday to Sunday. "Next week" is ${nextMonday} to ${addDays(nextMonday, 6)}.`,
    "",
    `AIRPORTS: every flight is between ${DUBAI.city} (${DUBAI.code}) and one of ${DESTINATIONS.map((place) => `${place.city} (${place.code})`).join(", ")}.`,
    "",
    "THE TRAVELLER'S TRIPS:",
    trips.length > 0 ? trips.map(describeTrip).join("\n") : "None.",
    "",
    "JOURNEYS, each with the fields it may carry:",
    '{"journey":"trips"}  show their trips',
    '{"journey":"status","trip":"CODE"}  is a flight on time, its gate, its times',
    '{"journey":"change-flight","trip":"CODE","when":WHEN}  move a flight they have to another day',
    '{"journey":"seat","trip":"CODE","wish":"window","seat":"14A"}  choose a seat. wish is one of window, aisle, middle, legroom, front',
    '{"journey":"bags","trip":"CODE","add":1}  add checked bags. add is how many more',
    '{"journey":"check-in","trip":"CODE"}  check in, or see the boarding pass',
    '{"journey":"cancel","trip":"CODE"}  cancel a booking for a refund',
    '{"journey":"book","to":"LHR","when":WHEN}  book a new flight. Use "from" only when it does not leave from Dubai',
    '{"journey":"insight","views":["spending"]}  answer a question about their own account: what they have spent, their payments, their trips compared',
    `views is one to three of: ${VIEW_NAMES.map((view) => `${view} (${VIEW_NOTES[view]})`).join("; ")}`,
    'WHEN is {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"}, with the same day twice for one day, or {"shiftDays":2} for "two days later" and {"shiftDays":-1} for "a day earlier".',
    'Leave out every field the traveller did not say. Leave out "trip" unless they said which trip, and then use its code from the list above. Never make up a code.',
    "",
    "REPLY WITH ONE OF:",
    '{"kind":"request","intents":[...]}  they ask for one or more journeys',
    '{"kind":"talk"}  they ask a question about flying with this airline that needs an answer in words, not an action',
    '{"kind":"unknown"}  anything else',
    ...(active
      ? [
          "",
          `A JOURNEY IS UNDER WAY: ${JSON.stringify(active.intents)}`,
          `ON SCREEN: ${onScreen(active)}`,
          "So you may also reply with:",
          '{"kind":"pick","value":"..."}  they choose one of the options on screen',
          '{"kind":"amend","intents":[...]}  they change a detail of the journey under way, or add another journey to it',
          '{"kind":"abandon"}  they want to stop the journey under way',
        ]
      : []),
  ].join("\n");
}

/** Find the JSON object in a reply, with or without a code fence around it, and drop empty fields. */
function readJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object");
  // Small models write "trip": null for "no trip". Treat that as leaving it out.
  return JSON.parse(text.slice(start, end + 1), (_key, value: unknown) => (value === null || value === "" ? undefined : value));
}

/** The answer a component would give for one of the options on screen, or null when the pick names none. */
function answerFor(active: NonNullable<Context["active"]>, value: string): Json | null {
  const props = active.props as Record<string, unknown>;
  const said = value.trim().toLowerCase();
  switch (active.widget) {
    case "trip-chooser": {
      const booking = (props.bookings as Booking[]).find((entry) => entry.code.toLowerCase() === said);
      return booking ? ({ booking } as unknown as Json) : null;
    }
    case "date-strip": {
      const day = (props.days as { date: string }[]).find((entry) => entry.date === said);
      return day ? { date: day.date, label: shortDay(day.date) } : null;
    }
    case "flight-list": {
      const number = said.replace(/\s+/g, "");
      const current = props.current as Flight | null;
      const flight = (props.flights as Flight[]).find((entry) => entry.number.replace(/\s+/g, "").toLowerCase() === number && entry.id !== current?.id);
      return flight ? ({ flight } as unknown as Json) : null;
    }
    case "bag-stepper": {
      const added = Number(said);
      const { current, max } = props as { current: number; max: number };
      return Number.isInteger(added) && added >= 1 && current + added <= max ? { count: current + added, added } : null;
    }
    case "price-summary":
    case "refund":
    case "passenger-check":
      return /^(yes|true|confirm|ok)$/.test(said) ? { confirmed: true } : null;
    default:
      return null;
  }
}

type Checked = { ok: true; understanding: Understanding } | { ok: false; problem: string };

/**
 * Check a reply and turn it into an understanding. A reply that does not fit
 * comes back with what is wrong, in words the model can act on.
 */
export function readReply(text: string, context: Context): Checked {
  let data: unknown;
  try {
    data = readJson(text);
  } catch {
    return { ok: false, problem: "The reply was not a JSON object." };
  }

  const parsed = modelReplySchema.safeParse(data);
  if (!parsed.success) {
    const where = parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".") || "reply"}: ${issue.message}`);
    return { ok: false, problem: `The reply did not have the expected shape. ${where.join("; ")}` };
  }
  const reply: ModelReply = parsed.data;

  if ((reply.kind === "amend" || reply.kind === "pick" || reply.kind === "abandon") && !context.active) {
    return { ok: false, problem: `"${reply.kind}" is only for when a journey is under way, and none is.` };
  }

  if (reply.kind === "pick") {
    const answer = context.active ? answerFor(context.active, reply.value) : null;
    return answer ? { ok: true, understanding: { kind: "answer", answer } } : { ok: false, problem: `"${reply.value}" is not one of the options on screen.` };
  }

  if (reply.kind !== "request" && reply.kind !== "amend") return { ok: true, understanding: { kind: reply.kind } };

  // What fits the schema must also fit the account: only bookings the
  // traveller has, and only places the airline flies.
  const codes = new Set(context.account.bookings.map((booking) => booking.code));
  const checked: Intent[] = [];
  for (const intent of reply.intents) {
    if ("trip" in intent && intent.trip !== undefined && !codes.has(intent.trip)) {
      return { ok: false, problem: `There is no booking "${intent.trip}". Use a code from the list of trips, or leave "trip" out.` };
    }
    if (intent.journey === "book") {
      for (const place of [intent.from, intent.to]) {
        if (place !== undefined && !airport(place)) return { ok: false, problem: `The airline does not fly to "${place}". Use an airport from the list.` };
      }
      checked.push(intent);
    } else if (intent.journey === "trips" || intent.journey === "insight") {
      checked.push(intent);
    } else {
      const { trip, ...rest } = intent;
      const ref: TripRef | undefined = trip === undefined ? undefined : { code: trip };
      checked.push({ ...rest, ...(ref ? { trip: ref } : {}) } as Intent);
    }
  }
  return { ok: true, understanding: { kind: reply.kind, intents: checked } };
}

/**
 * Ask a model what the words mean. Null when it cannot say in a form that
 * holds up, after one chance to repair it. Whatever goes wrong with the call
 * itself is thrown, for the caller to report.
 */
export async function understandByModel(words: string, context: Context, ask: Ask): Promise<Understanding | null> {
  const messages: Parameters<Ask>[0] = [
    { role: "system", content: systemPrompt(context) },
    { role: "user", content: words },
  ];

  const first = await ask(messages);
  const read = readReply(first, context);
  if (read.ok) return read.understanding;

  const second = await ask([
    ...messages,
    { role: "assistant", content: first },
    { role: "user", content: `That cannot be used. ${read.problem} Reply again with one JSON object only.` },
  ]);
  const again = readReply(second, context);
  return again.ok ? again.understanding : null;
}
