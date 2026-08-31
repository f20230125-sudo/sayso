"use client";

import { AnimatePresence, m, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type ComponentType } from "react";
import type { Json } from "@/agent/reference";
import { requestHandOff } from "@/components/focus";
import { AnswerCard } from "./answer";
import { BagStepper, DateStrip, FlightList, FlightSearch } from "./choosing";
import { SeatMap } from "./SeatMap";
import { PriceSummary, Receipt, TripChooser, Trips } from "./simple";
import { WIDGETS, summaryOf, type WidgetAnswer, type WidgetProps, type WidgetType } from "./specs";
import { BoardingPass, PassengerCheck, Refund, StatusTimeline } from "./travelling";

// Which React component draws each entry in specs.ts.
//
// The mapped type below is what keeps the two files honest: every widget in
// the specs must have a component here, and that component's properties are
// the ones its schema describes. Add a spec without a component and this file
// stops compiling.

export type ViewProps<T extends WidgetType> = {
  props: WidgetProps<T>;
  /** False once the traveller has answered, or the journey has been left. */
  active: boolean;
  onAnswer: (answer: WidgetAnswer<T>) => void;
};

const VIEWS: { [T in WidgetType]: ComponentType<ViewProps<T>> } = {
  trips: Trips,
  "trip-chooser": TripChooser,
  "flight-search": FlightSearch,
  "date-strip": DateStrip,
  "flight-list": FlightList,
  "seat-map": SeatMap,
  "bag-stepper": BagStepper,
  "passenger-check": PassengerCheck,
  refund: Refund,
  "price-summary": PriceSummary,
  receipt: Receipt,
  "boarding-pass": BoardingPass,
  "status-timeline": StatusTimeline,
  "answer-card": AnswerCard,
};

type HostProps = {
  widget: WidgetType;
  props: Json;
  /** "active" waits for the traveller, "answered" has its answer, "shown" never asked for one. */
  state: "active" | "answered" | "shown";
  answer: Json;
  /** The journey was left: a component still waiting folds to a line saying it was not answered. */
  closed: boolean;
  onAnswer: (answer: Json) => void;
};

/** The line an answered form folds into: its name, and what was chosen on a highlighter stroke. */
function Folded({ title, children, left, play, takeFocus }: { title: string; children: string; left: boolean; play: boolean; takeFocus: boolean }) {
  const line = useRef<HTMLDivElement>(null);
  // The form had the focus and has gone: the line it became takes it, so the
  // keyboard is not sent back to the top of the page.
  useEffect(() => {
    // Only if it was lost: the next form may have taken it already.
    if (takeFocus && (!document.activeElement || document.activeElement === document.body)) line.current?.focus();
  }, [takeFocus]);

  return (
    <div ref={line} tabIndex={-1} data-folded="" className="flex flex-wrap items-baseline gap-x-4 border-y border-rule py-2.5 text-[15px] leading-snug outline-offset-[-2px]">
      <span className="shrink-0 font-bold sm:w-36">{title}</span>
      <span className={`min-w-[12rem] flex-1 ${left ? "text-ink-3" : ""}`}>
        {left ? children : <span className={`stroke ${play ? "stroke-play" : ""}`}>{children}</span>}
      </span>
    </div>
  );
}

/** Draws one component of a reply, or the single line it folds into once answered. */
export function WidgetHost({ widget, props, state, answer, closed, onAnswer }: HostProps) {
  // A component folds once it is answered, and also when its journey is left
  // with it unanswered: either way there is nothing more to do with it.
  const left = closed && state === "active";
  const folded = state === "answered" || left;
  const View = VIEWS[widget] as ComponentType<ViewProps<WidgetType>>;
  const box = useRef<HTMLDivElement>(null);
  // For anyone who asks for less motion the fold is instant.
  const reduceMotion = useReducedMotion();

  // The highlighter stroke wipes in only for an answer given in this session,
  // not for a saved conversation that is loaded already answered.
  const [seen, setSeen] = useState(state);
  const [live, setLive] = useState(false);
  if (seen !== state) {
    setSeen(state);
    if (seen === "active" && state === "answered") setLive(true);
  }

  // Whether the answer came from something the keyboard was on.
  const [carryFocus, setCarryFocus] = useState(false);
  const answerWith = (value: Json) => {
    if (box.current?.contains(document.activeElement)) {
      requestHandOff();
      setCarryFocus(true);
    }
    onAnswer(value);
  };

  // The component closes and its one-line summary opens in its place. The
  // wrapper is clipped while it changes height, so it is given room on every
  // side for the focus ring, then pulled back by the same amount so nothing
  // around it moves.
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div
        key={folded ? "folded" : "open"}
        ref={box}
        className="-m-2 overflow-hidden p-2"
        data-widget-active={!folded && state === "active" ? "" : undefined}
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {folded ? (
          <Folded title={WIDGETS[widget].title} left={left} play={live} takeFocus={carryFocus}>
            {left ? "Not answered" : summaryOf(widget, props, answer)}
          </Folded>
        ) : (
          <View props={props as WidgetProps<WidgetType>} active={state === "active"} onAnswer={(value) => answerWith(value as Json)} />
        )}
      </m.div>
    </AnimatePresence>
  );
}
