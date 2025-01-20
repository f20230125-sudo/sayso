"use client";

import { Check } from "lucide-react";
import type { ComponentType } from "react";
import type { Json } from "@/agent/reference";
import { SeatMap } from "./SeatMap";
import { PriceSummary, Receipt, TripChooser, Trips } from "./simple";
import { WIDGETS, summaryOf, type WidgetAnswer, type WidgetProps, type WidgetType } from "./specs";

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
  "seat-map": SeatMap,
  "price-summary": PriceSummary,
  receipt: Receipt,
};

type HostProps = {
  widget: WidgetType;
  props: Json;
  /** "active" waits for the traveller, "answered" has its answer, "shown" never asked for one. */
  state: "active" | "answered" | "shown";
  answer: Json;
  /** The journey was left: the component stays on the page but can no longer be used. */
  closed: boolean;
  onAnswer: (answer: Json) => void;
};

/** Draws one component of a reply, or the single line it folds into once answered. */
export function WidgetHost({ widget, props, state, answer, closed, onAnswer }: HostProps) {
  if (state === "answered") {
    return (
      <div className="flex items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-2.5 text-[14px]">
        <Check size={15} className="shrink-0 text-ok" aria-hidden="true" />
        <span className="eyebrow shrink-0">{WIDGETS[widget].title}</span>
        <span className="min-w-0 truncate">{summaryOf(widget, props, answer)}</span>
      </div>
    );
  }

  const View = VIEWS[widget] as ComponentType<ViewProps<WidgetType>>;
  return (
    <div className={closed && state === "active" ? "opacity-60" : ""}>
      <View props={props as WidgetProps<WidgetType>} active={state === "active" && !closed} onAnswer={(value) => onAnswer(value as Json)} />
    </div>
  );
}
