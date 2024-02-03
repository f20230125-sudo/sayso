# Sayso

Say what you need, and the screen builds itself.

Sayso is a service desk for a made-up airline. You type what you want in your own words ("give me a window seat on my London flight") and, instead of a wall of text, the reply is built from working pieces of interface: a seat map, a price, a receipt.

Live: https://sayso-sigma.vercel.app

It is being built in stages. This README grows with it.

## What you can ask for

Eight journeys, in your own words, several in one sentence if you like:

| Journey | Try saying |
| --- | --- |
| See my trips | "Show my trips" |
| Flight status | "Is my flight on time?" |
| Change a flight | "Move my London flight to next week" |
| Choose a seat | "Give me a window seat" |
| Add bags | "Add two bags to my Istanbul flight" |
| Check in | "Check me in" |
| Cancel and refund | "Cancel my Istanbul trip" |
| Book a flight | "Book a flight to Paris next Friday" |

"Move my London flight to next week, window seat, and add a bag" is one request: three journeys, one price, one payment. Anything a component asks can also be typed ("the cheapest", "14A", "yes"), and a change of mind partway ("aisle instead") changes the journey in place instead of starting again.

## How it works

Every request goes through four steps, each plain TypeScript with no React in it:

1. **Understand.** The words become intents: which journey, which trip, what details. Rules do this with no model and no key.
2. **Plan.** The intents become a list of steps: say a line, call the airline's API, show a component. A plan is plain data.
3. **Run.** The steps run one by one. When a component needs an answer, the run pauses, and picks up again when the answer is in.
4. **Check.** The result is compared with what was asked for, and the comparison is shown.

Three rules hold it together:

- **The plan chooses, the code computes.** A plan can only ask for components from a fixed list (`src/widgets/specs.ts`), with the properties each one's schema allows. Every price, seat and flight on screen comes from the airline's API by reference, never from free text.
- **A run is data, not a process.** "Waiting for a seat choice" is a value in the Redux store and in the browser's storage. Reload the page halfway through and the seat map is still there, waiting.
- **The server never trusts a price from the browser.** Confirming an order makes the server work the price out again and refuse if it differs.

## The airline's REST API

The airline keeps no database. Flights, prices and free seats are worked out from the route and the date, so every visitor sees the same timetable. Bookings live in the visitor's browser and travel with each request.

| Method | Route | Returns |
| --- | --- | --- |
| GET | `/api/flights?from=DXB&to=LHR&date=2026-10-15` | Every flight on that route that day |
| GET | `/api/flights/calendar?from=DXB&to=LHR&start=2026-10-12&days=14` | The cheapest fare on each day |
| GET | `/api/flights/:id/seats` | The cabin of one flight, with taken seats marked |
| GET | `/api/flights/:id/status?at=2026-10-06T10:30:00Z` | Where one flight stands at a moment: late or not, gate, steps to landing |
| POST | `/api/quotes` | What a list of changes to a booking would cost |
| POST | `/api/orders` | The booking after the changes, and a receipt |
| GET | `/api/health` | `{ status: "ok" }` |

Errors are `{ error: { code, message } }` with a message fit to show to a person.

## Run it yourself

```bash
npm install
npm run dev        # http://localhost:3030
```

Checks:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e        # Playwright, against the dev server
```

## Layout

```
src/app/            the page, and the REST routes under api/
src/airline/        timetable, cabin, pricing, the demo account (no database)
src/agent/          understand, plan, run, check: plain TypeScript, no React
src/widgets/        the components a reply is built from, and their schemas
src/store/          Redux Toolkit: conversation, account, saving to the browser
src/components/     the desk page, the ask bar, a turn of the conversation
```

## Licence

MIT. Juno Air is made up; nothing here is really booked or charged.
