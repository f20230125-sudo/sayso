"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shortDay } from "@/airline/dates";
import type { Seat } from "@/airline/schema";
import { describeSeat } from "@/airline/seats";
import { Button } from "@/components/ui";
import type { ViewProps } from "./registry";
import { money } from "./specs";

// The cabin of one flight. The traveller picks a free seat.
//
// It is a grid in the accessibility sense too: one seat takes the Tab key,
// the arrow keys move between seats, and each seat says what it is ("14A,
// window, free, AED 35") to a screen reader.

const WISH_WORDS = { window: "Window", aisle: "Aisle", middle: "Middle", legroom: "Extra legroom", front: "Front" } as const;

function seatLabel(seat: Seat, mine: boolean): string {
  const state = mine ? "your seat now" : seat.taken ? "taken" : "free";
  const price = seat.taken || mine ? "" : seat.price > 0 ? `, ${money(seat.price)}` : ", no charge";
  return `${seat.id}, ${describeSeat(seat.kinds)}, ${state}${price}`;
}

export function SeatMap({ props, active, onAnswer }: ViewProps<"seat-map">) {
  const { map, flight, wish, current, preselect } = props;
  const seats = useMemo(() => map.rows.flatMap((row) => row.seats), [map]);
  const pickable = (seat: Seat) => !seat.taken && seat.id !== current;
  const matches = (seat: Seat) => wish !== null && seat.kinds.includes(wish) && pickable(seat);

  const [selected, setSelected] = useState<string | null>(() => {
    const named = seats.find((seat) => seat.id === preselect);
    return named && pickable(named) ? named.id : null;
  });
  // The one seat the Tab key lands on. The arrow keys move it.
  const [cursor, setCursor] = useState<string>(() => selected ?? seats.find(matches)?.id ?? seats.find(pickable)?.id ?? seats[0].id);

  const cabin = useRef<HTMLDivElement>(null);
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  // Bring the first seat worth looking at into view, inside the cabin only.
  useEffect(() => {
    const frame = cabin.current;
    const target = buttons.current.get(cursor);
    if (!frame || !target) return;
    frame.scrollTop = Math.max(0, target.offsetTop - frame.clientHeight / 2);
    // Only on arrival: after that the traveller is in charge of the scroll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chosen = seats.find((seat) => seat.id === selected) ?? null;

  function move(from: Seat, key: string): void {
    const column = map.letters.indexOf(from.letter);
    const target =
      key === "ArrowUp"
        ? seats.find((seat) => seat.row === from.row - 1 && seat.letter === from.letter)
        : key === "ArrowDown"
          ? seats.find((seat) => seat.row === from.row + 1 && seat.letter === from.letter)
          : key === "ArrowLeft"
            ? seats.find((seat) => seat.row === from.row && seat.letter === map.letters[column - 1])
            : seats.find((seat) => seat.row === from.row && seat.letter === map.letters[column + 1]);
    if (!target) return;
    setCursor(target.id);
    buttons.current.get(target.id)?.focus();
  }

  return (
    <section className="doc overflow-hidden" aria-label={`Seats on ${flight.number}`}>
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule px-5 py-3.5">
        <span className="flex flex-wrap items-baseline gap-x-3">
          <span className="text-[15px] font-bold">Seat map</span>
          <span className="text-[13px] text-ink-3">
            {flight.number}, {flight.fromCity} to {flight.toCity}, {shortDay(flight.date)}
          </span>
        </span>
        <span className="text-[13px] text-ink-2">{current ? `Your seat now: ${current}` : "No seat yet"}</span>
      </header>

      <div ref={cabin} className="relative max-h-[352px] overflow-y-auto px-5 py-4">
        <div role="grid" aria-label={`Cabin of ${flight.number}, rows 1 to ${map.rows.length}`} className="mx-auto w-fit">
          <div role="row" className="mb-1 flex items-center gap-1.5">
            <span role="columnheader" className="w-7" aria-label="Row" />
            {map.letters.map((letter, index) => (
              <span
                key={letter}
                role="columnheader"
                className={`flex h-6 w-8 items-center justify-center text-[12.5px] text-ink-3 ${index === map.aisleAfter ? "ml-6" : ""}`}
              >
                {letter}
              </span>
            ))}
          </div>

          {map.rows.map((row) => (
            <div key={row.row} role="row" className={`flex items-center gap-1.5 ${row.exit ? "my-3" : "my-1.5"}`}>
              <span role="rowheader" className="w-7 text-right text-[12px] text-ink-3">
                {row.row}
              </span>
              {row.seats.map((seat, index) => {
                const mine = seat.id === current;
                const isSelected = seat.id === selected;
                const free = pickable(seat);
                // Chosen is ink on paper, the desk's marking is the highlighter, taken is paper-2 and says nothing.
                const look = isSelected
                  ? "border-ink bg-ink font-bold text-paper"
                  : mine
                    ? "border-dashed border-ink bg-paper text-ink"
                    : !free
                      ? "border-transparent bg-paper-2 text-transparent"
                      : matches(seat)
                        ? "border-mark-edge bg-mark text-on-mark hover:shadow-[inset_0_0_0_1px_var(--mark-edge)]"
                        : "border-edge bg-paper text-ink-2 hover:border-ink hover:text-ink";
                return (
                  <span key={seat.id} role="gridcell" className={index === map.aisleAfter ? "ml-6" : ""}>
                    <button
                      ref={(element) => {
                        if (element) buttons.current.set(seat.id, element);
                        else buttons.current.delete(seat.id);
                      }}
                      type="button"
                      tabIndex={seat.id === cursor ? 0 : -1}
                      aria-label={seatLabel(seat, mine)}
                      aria-pressed={isSelected}
                      aria-disabled={!free || !active}
                      onFocus={() => setCursor(seat.id)}
                      onClick={() => {
                        if (free && active) setSelected(isSelected ? null : seat.id);
                      }}
                      onKeyDown={(event) => {
                        if (event.key.startsWith("Arrow")) {
                          event.preventDefault();
                          move(seat, event.key);
                        }
                      }}
                      className={`flex h-8 w-8 items-center justify-center rounded-seat border text-[12px] transition-colors duration-150 ${look} ${
                        free && active ? "cursor-pointer" : "cursor-default"
                      }`}
                    >
                      {mine ? "You" : seat.letter}
                    </button>
                  </span>
                );
              })}
              {row.exit ? <span className="ml-2 hidden text-[12.5px] text-ink-3 sm:inline">More legroom</span> : null}
            </div>
          ))}
        </div>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-rule px-5 py-3">
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-2" aria-label="Key">
          {wish ? (
            <li className="flex items-center gap-1.5">
              <span className="h-3.5 w-3.5 rounded-seat border border-mark-edge bg-mark" />
              {WISH_WORDS[wish]}
            </li>
          ) : null}
          <li className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-seat border border-edge bg-paper" />
            Free
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-seat bg-paper-2" />
            Taken
          </li>
        </ul>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <span className="text-[13px] text-ink-2" aria-live="polite">
            {chosen ? `${chosen.id}, ${describeSeat(chosen.kinds)}, ${chosen.price > 0 ? money(chosen.price) : "no charge"}` : "Pick a seat"}
          </span>
          <Button
            variant="primary"
            disabled={!chosen || !active}
            onClick={() => chosen && onAnswer({ seat: chosen.id, kinds: chosen.kinds, price: chosen.price })}
          >
            {chosen ? `Choose ${chosen.id}` : "Choose seat"}
          </Button>
        </div>
      </footer>
    </section>
  );
}
