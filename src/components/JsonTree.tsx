"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import type { Json } from "@/agent/reference";

// Shows a piece of data as a tree that opens and closes: the real answer of an
// API call, as it came back.

const PAGE = 30;

function Scalar({ value }: { value: Exclude<Json, Json[] | { [key: string]: Json }> }) {
  if (value === null) return <span className="text-faint">null</span>;
  if (typeof value === "string") return <span className="break-all text-ok">&quot;{value.length > 300 ? `${value.slice(0, 300)}…` : value}&quot;</span>;
  if (typeof value === "boolean") return <span className="text-warn">{String(value)}</span>;
  return <span className="text-accent">{String(value)}</span>;
}

function Row({ label, value, depth, openDepth }: { label: string | null; value: Json; depth: number; openDepth: number }) {
  const isBranch = value !== null && typeof value === "object";
  const entries: [string | number, Json][] = !isBranch ? [] : Array.isArray(value) ? value.map((entry, index) => [index, entry]) : Object.entries(value);
  const [open, setOpen] = useState(depth < openDepth);
  const [shown, setShown] = useState(PAGE);
  const summary = Array.isArray(value) ? `${value.length} ${value.length === 1 ? "item" : "items"}` : `${entries.length} ${entries.length === 1 ? "field" : "fields"}`;

  return (
    <li>
      <div className="flex min-h-6 items-start gap-1 rounded px-1 hover:bg-surface-2">
        {isBranch ? (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            aria-expanded={open}
            aria-label={`${open ? "Close" : "Open"} ${label ?? "the data"}`}
            className="mt-0.5 flex h-5 w-4 shrink-0 items-center justify-center text-faint hover:text-fg"
          >
            {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        ) : (
          <span className="w-4 shrink-0" />
        )}
        <span className="min-w-0 flex-1 py-0.5 leading-5">
          {label !== null ? <span className="text-muted">{label}: </span> : null}
          {isBranch ? <span className="text-faint">{summary}</span> : <Scalar value={value} />}
        </span>
      </div>

      {isBranch && open ? (
        <ul className="ml-[11px] border-l border-line pl-1.5">
          {entries.slice(0, shown).map(([key, entry]) => (
            <Row key={key} label={String(key)} value={entry} depth={depth + 1} openDepth={openDepth} />
          ))}
          {entries.length > shown ? (
            <li>
              <button type="button" onClick={() => setShown(shown + PAGE)} className="ml-5 rounded px-1 py-0.5 text-[11px] font-medium text-accent hover:bg-accent-soft">
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
