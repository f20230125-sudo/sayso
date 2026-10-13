"use client";

import { CircleAlert, Check } from "lucide-react";
import { Fragment, useMemo } from "react";
import { itemsOf, type Item } from "@/agent/run";
import type { Mark, Turn } from "@/store/conversationSlice";
import { useAppDispatch } from "@/store/hooks";
import { answer, drive } from "@/store/thunks";
import { uiActions } from "@/store/uiSlice";
import { WidgetHost } from "@/widgets/registry";
import { askInput, requestHandOff } from "./focus";
import { Button } from "./ui";

// One turn of the conversation, laid out as a docket: the traveller's words as
// the heading, the desk's lines under them, the one open form as a box, the
// finished ones as ruled lines, and the turn closed by a stub.

/** What the traveller said. The first words of a turn are its heading; what is said partway through is smaller. */
export function Said({ words, partway = false }: { words: string; partway?: boolean }) {
  if (partway) return <p className="max-w-[24em] text-[18px] font-bold leading-snug tracking-[-0.01em]">{words}</p>;
  return <h2 className="max-w-[24em] text-[22px] font-bold leading-[1.2] tracking-[-0.015em] sm:text-[26px]">{words}</h2>;
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[62ch] text-ink-2">{children}</p>;
}

/** A reply in words. One written by a model says so, and shows a caret while more is arriving. */
function Reply({ text, by, arriving }: { text: string; by?: string | null; arriving: boolean }) {
  if (!by) return <Line>{text}</Line>;
  return (
    <div className="max-w-[62ch]">
      <p className="whitespace-pre-wrap text-ink" aria-live="polite" aria-busy={arriving}>
        {text}
        {arriving ? <span className="ml-0.5 inline-block h-[1.1em] w-[2px] translate-y-[3px] bg-ink" aria-hidden="true" /> : null}
      </p>
      <p className="mt-1.5 text-[12.5px] text-ink-3">Written by {by}, from the airline&apos;s rules</p>
    </div>
  );
}

export function Working({ label }: { label: string }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-ink-2" role="status">
      {label}
      <span className="working-rule" aria-hidden="true" />
    </div>
  );
}

/** Where each thing said mid-journey belongs: just before the first item at or after the step it was said at. */
function placeMarks(turn: Turn, items: Item[]): { before: Map<number, Mark[]>; after: Mark[] } {
  const stepIndex = new Map(turn.run?.steps.map((step, index) => [step.id, index]) ?? []);
  const before = new Map<number, Mark[]>();
  const after: Mark[] = [];

  for (const mark of turn.marks) {
    const saidAt = mark.beforeStep === null || mark.reply ? undefined : stepIndex.get(mark.beforeStep);
    const slot = saidAt === undefined ? -1 : items.findIndex((item) => (stepIndex.get(item.stepId) ?? -1) >= saidAt);
    if (slot === -1) after.push(mark);
    else before.set(slot, [...(before.get(slot) ?? []), mark]);
  }
  return { before, after };
}

function MarkView({ mark, arriving }: { mark: Mark; arriving: boolean }) {
  return (
    <>
      <Said words={mark.words} partway />
      {mark.reply !== undefined && (mark.reply !== "" || mark.by) ? <Reply text={mark.reply} by={mark.by} arriving={arriving} /> : null}
    </>
  );
}

/** Which of the two read the words, and how long it took. */
function understoodBy(turn: Turn): string {
  // The rules often answer in less than a millisecond, and "0 ms" reads as a mistake.
  const time = turn.understoodMs >= 1000 ? `${(turn.understoodMs / 1000).toFixed(1)} s` : turn.understoodMs < 1 ? "under 1 ms" : `${turn.understoodMs} ms`;
  return turn.brain === "model" && turn.model ? `Understood by ${turn.model} in ${time}` : `Understood by the built-in rules in ${time}`;
}

export function TurnView({ turn }: { turn: Turn }) {
  const dispatch = useAppDispatch();
  const items = useMemo(() => (turn.run ? itemsOf(turn.run) : []), [turn.run]);
  const marks = useMemo(() => placeMarks(turn, items), [turn, items]);
  const closed = turn.run?.status === "stopped";

  return (
    <section className="flex flex-col gap-4" aria-label={`You said: ${turn.words}`}>
      <Said words={turn.words} />
      {turn.reply !== null && (turn.reply !== "" || turn.replyBy) ? <Reply text={turn.reply} by={turn.replyBy} arriving={turn.streaming} /> : null}

      {items.map((item, index) => (
        <Fragment key={`${item.kind}-${item.stepId}`}>
          {marks.before.get(index)?.map((mark, at) => <MarkView key={`${index}-${at}`} mark={mark} arriving={false} />)}

          {item.kind === "say" ? <Line>{item.text}</Line> : null}

          {item.kind === "widget" ? (
            <WidgetHost
              widget={item.widget}
              props={item.props}
              state={item.state}
              answer={item.answer}
              closed={closed}
              onAnswer={(value) => void dispatch(answer(turn.id, item.stepId, value))}
            />
          ) : null}

          {item.kind === "working" ? <Working label={item.label} /> : null}

          {item.kind === "failed" ? (
            <div className="doc flex flex-wrap items-center justify-between gap-3 border-[1.5px] border-bad px-4 py-3" role="alert">
              <span className="flex items-center gap-2.5 text-[15px]">
                <CircleAlert size={18} className="shrink-0 text-bad" aria-hidden="true" />
                {item.failure.message}
              </span>
              <Button
                size="sm"
                onClick={() => {
                  // The message leaves the page when the call is tried again: the keyboard goes to the ask bar, then on to the form.
                  requestHandOff();
                  askInput()?.focus();
                  void dispatch(drive(turn.id));
                }}
              >
                Try again
              </Button>
            </div>
          ) : null}
        </Fragment>
      ))}

      {marks.after.map((mark, at) => (
        <MarkView key={`after-${at}`} mark={mark} arriving={turn.streaming && mark === turn.marks.at(-1)} />
      ))}

      {turn.run && turn.run.checks.length > 0 ? (
        <ul className="flex flex-col gap-1.5 pt-1" aria-label="Checked against what you asked">
          {turn.run.checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2.5 text-[14px] leading-snug text-ink-2">
              {check.pass ? (
                <Check size={16} strokeWidth={2.5} className="mt-[2px] shrink-0 text-ink" aria-hidden="true" />
              ) : (
                <CircleAlert size={16} className="mt-[2px] shrink-0 text-warn" aria-hidden="true" />
              )}
              <span>
                {check.pass ? <span className="sr-only">Checked: </span> : <span className="font-bold text-warn">Differs: </span>}
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {turn.closing ? <p className="text-[15px] text-ink-3">{turn.closing}</p> : null}

      <button
        type="button"
        onClick={() => dispatch(uiActions.panelOpened(turn.id))}
        className="mt-1 flex min-h-8 w-full flex-wrap items-baseline gap-x-4 gap-y-0.5 border-t-2 border-dashed border-edge pt-2.5 pb-1.5 text-left text-[13px] text-ink-3 transition-colors duration-150 hover:text-ink"
      >
        <span>{understoodBy(turn)}</span>
        <span className="whitespace-nowrap font-bold text-ink underline underline-offset-4">How it worked</span>
      </button>
    </section>
  );
}
