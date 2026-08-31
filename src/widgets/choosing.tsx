"use client";

import { ArrowRight, CircleAlert, Minus, Plus } from "lucide-react";
import { useId, useState } from "react";
import { MONTHS, WEEKDAYS, duration, partsOf, shortDay, weekdayOf } from "@/airline/dates";
import { Button } from "@/components/ui";
import type { ViewProps } from "./registry";
import { money } from "./specs";

// The components that ask the traveller to choose: where and when to fly,
// which day, which flight, how many bags.

/** A fare, or the difference from the fare already paid: "+ AED 120", "− AED 60", "same fare". */
function fare(price: number, against: number | null): string {
  if (against === null) return money(price);
  const difference = price - against;
  if (difference === 0) return "same fare";
  return `${difference > 0 ? "+" : "−"} ${money(difference)}`;
}

/** A value written on a rule: the control itself is the line, and its caption sits under it. */
const RULED = "h-10 w-full rounded-none border-0 border-b-[1.5px] border-ink bg-transparent px-0 text-[17px] font-bold text-ink";

export function FlightSearch({ props, active, onAnswer }: ViewProps<"flight-search">) {
  const [to, setTo] = useState(props.destinations[0].code);
  const [date, setDate] = useState(props.suggested);
  const id = useId();
  const city = props.destinations.find((place) => place.code === to)?.city ?? to;
  const early = date < props.earliest;

  return (
    <form
      className="doc p-5"
      aria-label="Flight search"
      onSubmit={(event) => {
        event.preventDefault();
        if (active && !early) onAnswer({ to, toCity: city, date, label: shortDay(date) });
      }}
    >
      <div className="grid gap-5 sm:grid-cols-3">
        <div>
          <div className="flex h-10 items-center border-b-[1.5px] border-ink text-[17px] font-bold">Dubai (DXB)</div>
          <div className="mt-1 text-[12.5px] text-ink-3">From</div>
        </div>
        <div>
          <select id={`${id}-to`} className={RULED} value={to} aria-disabled={!active || undefined} onChange={(event) => active && setTo(event.target.value)}>
            {props.destinations.map((place) => (
              <option key={place.code} value={place.code}>
                {place.city} ({place.code})
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-to`} className="mt-1 block text-[12.5px] text-ink-3">
            To
          </label>
        </div>
        <div>
          <input
            id={`${id}-on`}
            type="date"
            className={RULED}
            value={date}
            min={props.earliest}
            required
            aria-invalid={early || undefined}
            aria-describedby={early ? `${id}-early` : undefined}
            aria-disabled={!active || undefined}
            onChange={(event) => active && setDate(event.target.value)}
          />
          <label htmlFor={`${id}-on`} className="mt-1 block text-[12.5px] text-ink-3">
            On
          </label>
        </div>
      </div>
      {early ? (
        <p id={`${id}-early`} className="mt-4 flex items-center gap-2 text-[14px] text-bad" role="status">
          <CircleAlert size={16} className="shrink-0" aria-hidden="true" />
          The earliest day you can choose is {shortDay(props.earliest)}.
        </p>
      ) : null}
      <div className="mt-5 flex justify-end">
        <Button type="submit" variant="primary" disabled={!active || early}>
          Find flights
        </Button>
      </div>
    </form>
  );
}

export function DateStrip({ props, active, onAnswer }: ViewProps<"date-strip">) {
  const { days, current, currentPrice } = props;
  const lowest = Math.min(...days.map((day) => day.price));

  if (days.length === 0) return <p className="doc p-5 text-[15px] text-ink-2">There are no flights on those days.</p>;

  return (
    <section className="doc p-3" aria-label="Days to choose from">
      <ul className="grid grid-cols-[repeat(auto-fit,minmax(76px,1fr))] gap-2 p-1.5">
        {days.map((day) => {
          const { month, dayOfMonth } = partsOf(day.date);
          const isCurrent = day.date === current;
          const isLowest = day.price === lowest;
          return (
            <li key={day.date}>
              <button
                type="button"
                aria-disabled={!active || undefined}
                onClick={() => active && onAnswer({ date: day.date, label: shortDay(day.date) })}
                aria-label={`${shortDay(day.date)}, ${fare(day.price, currentPrice)}${isCurrent ? ", the day you fly now" : ""}${isLowest ? ", lowest fare" : ""}`}
                className={`flex h-full w-full flex-col items-center rounded-control border-[1.5px] px-1 py-2.5 transition-colors duration-150 ${
                  isCurrent ? "border-dashed border-ink" : "border-edge"
                } ${active ? "cursor-pointer hover:border-ink hover:bg-paper-2" : "cursor-default"}`}
              >
                <span className="text-[13px] text-ink-2">{WEEKDAYS[weekdayOf(day.date)].slice(0, 3)}</span>
                <span className="mt-0.5 text-[22px] font-bold leading-none">{dayOfMonth}</span>
                <span className="mt-1 text-[12.5px] text-ink-3">{MONTHS[month - 1].slice(0, 3)}</span>
                <span className={`mt-2 whitespace-nowrap text-[13px] font-bold ${isLowest ? "stroke" : ""}`}>{fare(day.price, currentPrice).replace("AED ", "")}</span>
                <span className="mt-1 min-h-4 text-[12px] leading-4 text-ink-2">{isCurrent ? "You fly now" : isLowest ? "Lowest" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-2 pb-1 pt-2 text-[12.5px] text-ink-3">
        {currentPrice === null ? "Lowest fare each day, in AED." : "The difference from the fare you paid, in AED. A change fee is added at the end."}
      </p>
    </section>
  );
}

export function FlightList({ props, active, onAnswer }: ViewProps<"flight-list">) {
  const { flights, current } = props;
  if (flights.length === 0) return <p className="doc p-5 text-[15px] text-ink-2">There are no flights that day.</p>;

  return (
    <ul className="doc divide-y divide-rule overflow-hidden" aria-label="Flights to choose from">
      {flights.map((flight) => {
        const isCurrent = flight.id === current?.id;
        const usable = active && !isCurrent;
        return (
          <li key={flight.id}>
            <button
              type="button"
              aria-disabled={!usable || undefined}
              onClick={() => usable && onAnswer({ flight })}
              aria-label={`${flight.number}, leaves ${flight.departs}, lands ${flight.arrives}, ${isCurrent ? "the flight you are on now" : fare(flight.price, current?.price ?? null)}`}
              className={`flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors duration-150 ${usable ? "cursor-pointer hover:bg-paper-2" : "cursor-default"}`}
            >
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-x-2 text-[17px] font-bold leading-snug">
                  {flight.departs}
                  <ArrowRight size={16} className="shrink-0 text-ink-3" aria-hidden="true" />
                  {flight.arrives}
                  {flight.arrivesDayOffset > 0 ? <span className="text-[12.5px] font-normal text-ink-3">+{flight.arrivesDayOffset} day</span> : null}
                </span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-[13px] text-ink-2">
                  {flight.number}, {duration(flight.minutes)}, Direct
                  {flight.seatsLeft < 6 && !isCurrent ? (
                    <span className="flex items-center gap-1 text-warn">
                      <CircleAlert size={13} aria-hidden="true" />
                      {flight.seatsLeft} seats left
                    </span>
                  ) : null}
                </span>
              </span>
              <span className={`shrink-0 text-[15px] font-bold ${isCurrent ? "font-normal text-ink-3" : ""}`}>
                {isCurrent ? "Your flight now" : fare(flight.price, current?.price ?? null)}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function BagStepper({ props, active, onAnswer }: ViewProps<"bag-stepper">) {
  const { current, max, price } = props;
  const room = max - current;
  const [added, setAdded] = useState(Math.min(Math.max(props.add, 1), Math.max(room, 1)));
  const round = "flex h-11 w-11 items-center justify-center rounded-control border-[1.5px] border-ink bg-paper text-ink transition-colors duration-150 hover:bg-paper-2 aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-edge aria-disabled:text-ink-3 aria-disabled:hover:bg-paper";

  if (room <= 0) return <p className="doc p-5 text-[15px] text-ink-2">You already have {max} checked bags, which is the most one booking can hold.</p>;

  return (
    <section className="doc p-5" aria-label="Checked bags">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button type="button" className={round} aria-label="One bag fewer" aria-disabled={!active || added <= 1 || undefined} onClick={() => active && added > 1 && setAdded(added - 1)}>
            <Minus size={18} />
          </button>
          <span className="w-8 text-center text-[28px] font-bold leading-none" aria-live="polite" aria-label={`${added} to add`}>
            {added}
          </span>
          <button type="button" className={round} aria-label="One bag more" aria-disabled={!active || added >= room || undefined} onClick={() => active && added < room && setAdded(added + 1)}>
            <Plus size={18} />
          </button>
          <span className="text-[15px] text-ink-2">extra checked {added === 1 ? "bag" : "bags"}</span>
        </div>
        <span className="text-[17px] font-bold">{money(added * price)}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
        <span className="text-[13px] text-ink-2">
          You have {current} now. Each bag is {money(price)}, up to 23 kg.
        </span>
        <Button variant="primary" disabled={!active} onClick={() => onAnswer({ count: current + added, added })}>
          Add {added} {added === 1 ? "bag" : "bags"}
        </Button>
      </div>
    </section>
  );
}
