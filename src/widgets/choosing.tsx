"use client";

import { Minus, Plus } from "lucide-react";
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

export function FlightSearch({ props, active, onAnswer }: ViewProps<"flight-search">) {
  const [to, setTo] = useState(props.destinations[0].code);
  const [date, setDate] = useState(props.suggested);
  const id = useId();
  const city = props.destinations.find((place) => place.code === to)?.city ?? to;
  const field = "h-10 w-full rounded-lg border border-line bg-surface px-3 text-[14px] disabled:opacity-60";

  return (
    <form
      className="panel p-5"
      aria-label="Flight search"
      onSubmit={(event) => {
        event.preventDefault();
        if (date >= props.earliest) onAnswer({ to, toCity: city, date, label: shortDay(date) });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <div className="eyebrow mb-1.5">From</div>
          <div className="flex h-10 items-center rounded-lg border border-line bg-surface-2 px-3 text-[14px] text-muted">Dubai (DXB)</div>
        </div>
        <div>
          <label htmlFor={`${id}-to`} className="eyebrow mb-1.5 block">
            To
          </label>
          <select id={`${id}-to`} className={field} value={to} disabled={!active} onChange={(event) => setTo(event.target.value)}>
            {props.destinations.map((place) => (
              <option key={place.code} value={place.code}>
                {place.city} ({place.code})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-on`} className="eyebrow mb-1.5 block">
            On
          </label>
          <input
            id={`${id}-on`}
            type="date"
            className={`${field} tabular`}
            value={date}
            min={props.earliest}
            required
            disabled={!active}
            onChange={(event) => setDate(event.target.value)}
          />
        </div>
      </div>
      <div className="mt-5 flex justify-end">
        <Button type="submit" variant="primary" disabled={!active || date < props.earliest}>
          Find flights
        </Button>
      </div>
    </form>
  );
}

export function DateStrip({ props, active, onAnswer }: ViewProps<"date-strip">) {
  const { days, current, currentPrice } = props;
  const lowest = Math.min(...days.map((day) => day.price));

  if (days.length === 0) return <p className="panel p-5 text-[14px] text-muted">There are no flights on those days.</p>;

  return (
    <section className="panel p-3" aria-label="Days to choose from">
      <ul className="flex gap-2 overflow-x-auto p-1">
        {days.map((day) => {
          const { month, dayOfMonth } = partsOf(day.date);
          const isCurrent = day.date === current;
          const isLowest = day.price === lowest;
          return (
            <li key={day.date} className="min-w-[76px] flex-1">
              <button
                type="button"
                disabled={!active}
                onClick={() => onAnswer({ date: day.date, label: shortDay(day.date) })}
                aria-label={`${shortDay(day.date)}, ${fare(day.price, currentPrice)}${isCurrent ? ", the day you fly now" : ""}${isLowest ? ", lowest fare" : ""}`}
                className={`flex w-full flex-col items-center rounded-xl border px-1 py-3 transition-colors disabled:cursor-default ${
                  isCurrent ? "border-dashed border-fg" : "border-line"
                } ${active ? "hover:border-accent hover:bg-accent-soft" : ""}`}
              >
                <span className="eyebrow">{WEEKDAYS[weekdayOf(day.date)].slice(0, 3)}</span>
                <span className="tabular mt-1 text-[22px] font-semibold leading-none">{dayOfMonth}</span>
                <span className="mt-1 text-[12px] text-muted">{MONTHS[month - 1].slice(0, 3)}</span>
                <span className={`tabular mt-2.5 whitespace-nowrap text-[12px] font-medium ${isLowest ? "text-ok" : "text-muted"}`}>
                  {fare(day.price, currentPrice).replace("AED ", "")}
                </span>
                <span className="mt-0.5 h-3.5 text-[10px] text-faint">{isCurrent ? "You fly now" : isLowest ? "Lowest" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="px-2 pb-1 pt-2 text-[12px] text-faint">
        {currentPrice === null ? "Lowest fare each day, in AED." : "The difference from the fare you paid, in AED. A change fee is added at the end."}
      </p>
    </section>
  );
}

export function FlightList({ props, active, onAnswer }: ViewProps<"flight-list">) {
  const { flights, current } = props;
  if (flights.length === 0) return <p className="panel p-5 text-[14px] text-muted">There are no flights that day.</p>;

  return (
    <ul className="panel divide-y divide-line overflow-hidden" aria-label="Flights to choose from">
      {flights.map((flight) => {
        const isCurrent = flight.id === current?.id;
        return (
          <li key={flight.id}>
            <button
              type="button"
              disabled={!active || isCurrent}
              onClick={() => onAnswer({ flight })}
              aria-label={`${flight.number}, leaves ${flight.departs}, lands ${flight.arrives}, ${isCurrent ? "the flight you are on now" : fare(flight.price, current?.price ?? null)}`}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent"
            >
              <span className="min-w-0 flex-1">
                <span className="tabular block text-[17px] font-semibold tracking-tight">
                  {flight.departs} <span className="mx-1 font-normal text-faint">→</span> {flight.arrives}
                  {flight.arrivesDayOffset > 0 ? <span className="ml-1.5 text-[12px] font-normal text-faint">+{flight.arrivesDayOffset} day</span> : null}
                </span>
                <span className="tabular mt-0.5 block text-[13px] text-muted">
                  {flight.number} · {duration(flight.minutes)} · Direct
                  {flight.seatsLeft < 6 && !isCurrent ? <span className="ml-2 text-warn">{flight.seatsLeft} seats left</span> : null}
                </span>
              </span>
              <span className={`tabular shrink-0 text-[14px] font-medium ${isCurrent ? "text-faint" : ""}`}>
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
  const round = "flex h-9 w-9 items-center justify-center rounded-full border border-line-strong text-fg transition-colors hover:border-accent disabled:opacity-40 disabled:hover:border-line-strong";

  if (room <= 0) return <p className="panel p-5 text-[14px] text-muted">You already have {max} checked bags, which is the most one booking can hold.</p>;

  return (
    <section className="panel p-5" aria-label="Checked bags">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button type="button" className={round} aria-label="One bag fewer" disabled={!active || added <= 1} onClick={() => setAdded(added - 1)}>
            <Minus size={16} />
          </button>
          <span className="tabular w-8 text-center text-[28px] font-semibold leading-none" aria-live="polite" aria-label={`${added} to add`}>
            {added}
          </span>
          <button type="button" className={round} aria-label="One bag more" disabled={!active || added >= room} onClick={() => setAdded(added + 1)}>
            <Plus size={16} />
          </button>
          <span className="text-[14px] text-muted">extra checked {added === 1 ? "bag" : "bags"}</span>
        </div>
        <span className="tabular text-[17px] font-semibold">{money(added * price)}</span>
      </div>
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <span className="text-[13px] text-muted">
          You have {current} now. Each bag is {money(price)}, up to 23 kg.
        </span>
        <Button variant="primary" disabled={!active} onClick={() => onAnswer({ count: current + added, added })}>
          Add {added} {added === 1 ? "bag" : "bags"}
        </Button>
      </div>
    </section>
  );
}
