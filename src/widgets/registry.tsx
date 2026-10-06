"use client";

import { Check, Minus } from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import type { ComponentType } from "react";
import type { Json } from "@/agent/reference";
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

/** Draws one component of a reply, or the single line it folds into once answered. */
export function WidgetHost({ widget, props, state, answer, closed, onAnswer }: HostProps) {
  // A component folds once it is answered, and also when its journey is left
  // with it unanswered: either way there is nothing more to do with it.
  const left = closed && state === "active";
  const folded = state === "answered" || left;
  const View = VIEWS[widget] as ComponentType<ViewProps<WidgetType>>;

  // The component closes and its one-line summary opens in its place. The
  // wrapper is clipped while it changes height, so it is given room on every
  // side for the card's shadow and the focus ring, then pulled back by the
  // same amount so nothing around it moves.
  return (
    <AnimatePresence initial={false} mode="wait">
      <m.div
        key={folded ? "folded" : "open"}
        className="-m-4 overflow-hidden p-4"
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
      >
        {folded ? (
          <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px]">
            {left ? <Minus size={15} className="shrink-0 text-faint" aria-hidden="true" /> : <Check size={15} className="shrink-0 text-ok" aria-hidden="true" />}
            <span className="eyebrow shrink-0">{WIDGETS[widget].title}</span>
            <span className={`min-w-0 truncate ${left ? "text-muted" : ""}`}>{left ? "Not answered" : summaryOf(widget, props, answer)}</span>
          </div>
        ) : (
          <View props={props as WidgetProps<WidgetType>} active={state === "active"} onAnswer={(value) => onAnswer(value as Json)} />
        )}
      </m.div>
    </AnimatePresence>
  );
}
