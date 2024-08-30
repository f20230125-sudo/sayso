"use client";

import type { ViewProps } from "./registry";
import type { Block } from "./specs";

// An answer about the traveller's own account: a few figures, a chart, a
// table. Which of them appear depends on the question; every number in them
// was worked out by code before it got here.
//
// The charts follow a few fixed rules. One series, so one colour and no
// legend: the title says what is plotted. Bars are in ink, thin, rounded at the
// data end and square at the baseline, and the desk marks the largest one in
// highlighter with an ink edge. Text is always ink. Only the tallest column is
// labelled; the rest show their value on hover or focus, and every value is
// also there as text for a screen reader.

type Rows = Extract<Block, { kind: "columns" }>["rows"];

function Figures({ figures }: Extract<Block, { kind: "figures" }>) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
      {figures.map((figure) => (
        // The value is written on a rule with its caption under it, though the term comes first in the source.
        <div key={figure.label} className="flex flex-col">
          <dt className="order-2 mt-1 text-[12.5px] leading-snug text-ink-3">{figure.label}</dt>
          <dd className="order-1 border-b-[1.5px] border-ink pb-1 text-[26px] font-bold leading-none tracking-[-0.015em]">{figure.value}</dd>
          {figure.note ? <dd className="order-3 mt-1 text-[12.5px] text-ink-2">{figure.note}</dd> : null}
        </div>
      ))}
    </dl>
  );
}

/** Amounts over time: time runs left to right, one thin column each. */
function Columns({ title, rows }: { title: string; rows: Rows }) {
  const top = Math.max(...rows.map((row) => row.value), 1);
  const tallest = rows.reduce((best, row) => (row.value > best.value ? row : best), rows[0]);
  return (
    <figure>
      <figcaption className="mb-3 text-[15px] font-bold">{title}</figcaption>
      <ul className="flex h-[132px] items-end gap-1 border-b-[1.5px] border-ink" aria-label={title}>
        {rows.map((row) => (
          <li key={row.label} tabIndex={0} className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end rounded-seat">
            <span className="sr-only">
              {row.label}: {row.text}
            </span>
            {/* The value: always on the tallest column, on the others while pointed at or focused. */}
            <span
              aria-hidden="true"
              className={`mb-1 whitespace-nowrap text-[12px] text-ink-2 ${
                // It sits just above its own column, so it never lands on a neighbour's label.
                row === tallest ? "" : "pointer-events-none z-10 rounded-seat border border-edge bg-paper px-1.5 py-0.5 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100"
              }`}
            >
              {row === tallest ? row.text : `${row.label}: ${row.text}`}
            </span>
            <span
              aria-hidden="true"
              className={`w-full max-w-[24px] rounded-t-[4px] border transition-opacity duration-150 group-hover:opacity-80 ${
                row === tallest ? "border-mark-edge bg-mark" : "border-transparent bg-ink-2"
              }`}
              style={{ height: `${Math.max(0, (row.value / top) * 78)}%` }}
            />
          </li>
        ))}
      </ul>
      <ul className="mt-1.5 flex gap-1" aria-hidden="true">
        {rows.map((row) => (
          <li key={row.label} className="min-w-0 flex-1 text-center text-[12px] text-ink-3">
            {row.label}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Amounts by category: largest first, one thin bar each, the value written at its end. */
function Bars({ title, rows }: { title: string; rows: Rows }) {
  const top = Math.max(...rows.map((row) => row.value), 1);
  return (
    <figure>
      <figcaption className="mb-3 text-[15px] font-bold">{title}</figcaption>
      <ul className="flex flex-col gap-2.5" aria-label={title}>
        {rows.map((row) => (
          <li key={row.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 text-[14px]">
            <span className="truncate text-ink-2">{row.label}</span>
            <span className="h-3" aria-hidden="true">
              <span className={`block h-full rounded-r-[4px] border ${row.value === top ? "border-mark-edge bg-mark" : "border-transparent bg-ink-2"}`} style={{ width: `${Math.max(1, (row.value / top) * 100)}%` }} />
            </span>
            <span className="whitespace-nowrap font-bold">{row.text}</span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function Table({ title, columns, rows }: Extract<Block, { kind: "table" }>) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[14px]">
        <caption className="mb-2 text-left text-[15px] font-bold">{title}</caption>
        <thead>
          <tr className="border-b-[1.5px] border-ink">
            {columns.map((column, index) => (
              <th key={column} scope="col" className={`whitespace-nowrap py-2 pr-4 text-[12.5px] font-normal text-ink-3 ${index === columns.length - 1 ? "text-right" : ""}`}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, at) => (
            <tr key={at} className="border-b border-rule last:border-0">
              {row.map((cell, index) => (
                <td key={index} className={`py-2 pr-4 ${index === 0 ? "whitespace-nowrap text-ink-2" : ""} ${index === row.length - 1 ? "whitespace-nowrap text-right font-bold" : ""}`}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AnswerCard({ props }: ViewProps<"answer-card">) {
  return (
    <section className="doc flex flex-col gap-7 p-5" aria-label={props.title}>
      {props.blocks.map((block, index) => {
        switch (block.kind) {
          case "figures":
            return <Figures key={index} {...block} />;
          case "columns":
            return <Columns key={index} title={block.title} rows={block.rows} />;
          case "bars":
            return <Bars key={index} title={block.title} rows={block.rows} />;
          case "table":
            return <Table key={index} {...block} />;
        }
      })}
    </section>
  );
}
