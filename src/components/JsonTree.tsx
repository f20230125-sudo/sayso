"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Json } from "@/agent/reference";

// Shows a piece of data as a tree that opens and closes: the real answer of an
// API call, as it came back. It is verbatim text, so it is set in the mono face.

const PAGE = 30;

function Scalar({ value }: { value: Exclude<Json, Json[] | { [key: string]: Json }> }) {
  if (value === null) return <span className="text-ink-3">null</span>;
  if (typeof value === "string") return <span className="break-all text-ink">&quot;{value.length > 300 ? `${value.slice(0, 300)}…` : value}&quot;</span>;
  return <span className="font-bold text-ink">{String(value)}</span>;
}

function Row({ label, value, depth, openDepth }: { label: string | null; value: Json; depth: number; openDepth: number }) {
  const isBranch = value !== null && typeof value === "object";
  const entries: [string | number, Json][] = !isBranch ? [] : Array.isArray(value) ? value.map((entry, index) => [index, entry]) : Object.entries(value);
  const [open, setOpen] = useState(depth < openDepth);
  const [shown, setShown] = useState(PAGE);
  const summary = Array.isArray(value) ? `${value.length} ${value.length === 1 ? "item" : "items"}` : `${entries.length} ${entries.length === 1 ? "field" : "fields"}`;

  return (
    <li>
      <div className="flex min-h-6 items-start gap-0.5 rounded-seat px-0.5 hover:bg-paper-2">
        {isBranch ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} ${label ?? "the data"}`}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-seat text-ink-2 hover:text-ink"
          >
            {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-6 shrink-0" />
        )}
        <code className="block min-w-0 flex-1 py-0.5 leading-5">
          {label !== null ? <span className="text-ink-2">{label}: </span> : null}
          {isBranch ? <span className="text-ink-3">{summary}</span> : <Scalar value={value} />}
        </code>
      </div>

      {isBranch && open ? (
        <ul className="ml-3 border-l border-rule pl-1.5">
          {entries.slice(0, shown).map(([key, entry]) => (
            <Row key={key} label={String(key)} value={entry} depth={depth + 1} openDepth={openDepth} />
          ))}
          {entries.length > shown ? (
            <li>
              <button
                type="button"
                onClick={() => setShown(shown + PAGE)}
                className="ml-6 min-h-6 rounded-seat px-1.5 py-0.5 font-sans text-[12.5px] font-bold text-ink underline underline-offset-4 hover:bg-paper-2"
              >
                Show {Math.min(PAGE, entries.length - shown)} more of {entries.length - shown}
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

type Props = {
  value: Json;
  /** A name for the top row. */
  label?: string;
  /** How many levels start open. */
  openDepth?: number;
};

export function JsonTree({ value, label, openDepth = 1 }: Props) {
  return (
    <ul className="font-mono text-[12px]">
      <Row label={label ?? null} value={value} depth={0} openDepth={openDepth} />
    </ul>
  );
}
