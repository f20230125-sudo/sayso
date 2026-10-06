"use client";

import { AlertCircle, CircleAlert, CircleCheck } from "lucide-react";
import { Fragment, useMemo } from "react";
import { itemsOf, type Item } from "@/agent/run";
import type { Mark, Turn } from "@/store/conversationSlice";
import { useAppDispatch } from "@/store/hooks";
import { answer, drive } from "@/store/thunks";
import { WidgetHost } from "@/widgets/registry";
import { Button } from "./ui";

// One turn of the conversation: what the traveller said, then the lines and
// components that came back.

function Said({ words }: { words: string }) {
  return (
    <div className="rise-in">
      <div className="eyebrow mb-1.5">You</div>
      <p className="text-[19px] font-medium leading-snug tracking-tight">{words}</p>
    </div>
  );
}

function Line({ children }: { children: React.ReactNode }) {
  return <p className="rise-in text-[15px] leading-relaxed text-muted">{children}</p>;
}

function Working({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2.5 text-[14px] text-faint" role="status">
      <span className="flex gap-1" aria-hidden="true">
        {[0, 1, 2].map((dot) => (
          <span key={dot} className="working-dot h-1.5 w-1.5 rounded-full bg-accent" style={{ animationDelay: `${dot * 160}ms` }} />
        ))}
      </span>
      {label}
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

function MarkView({ mark }: { mark: Mark }) {
  return (
    <>
      <Said words={mark.words} />
      {mark.reply ? <Line>{mark.reply}</Line> : null}
    </>
  );
}

export function TurnView({ turn }: { turn: Turn }) {
  const dispatch = useAppDispatch();
  const items = useMemo(() => (turn.run ? itemsOf(turn.run) : []), [turn.run]);
  const marks = useMemo(() => placeMarks(turn, items), [turn, items]);
  const closed = turn.run?.status === "stopped";

  return (
    <section className="flex flex-col gap-4" aria-label={`You said: ${turn.words}`}>
      <Said words={turn.words} />
      {turn.reply ? <Line>{turn.reply}</Line> : null}

      {items.map((item, index) => (
        <Fragment key={`${item.kind}-${item.stepId}`}>
          {marks.before.get(index)?.map((mark, at) => <MarkView key={`${index}-${at}`} mark={mark} />)}

          {item.kind === "say" ? <Line>{item.text}</Line> : null}

          {item.kind === "widget" ? (
            <div className="rise-in">
              <WidgetHost
                widget={item.widget}
                props={item.props}
                state={item.state}
                answer={item.answer}
                closed={closed}
                onAnswer={(value) => void dispatch(answer(turn.id, item.stepId, value))}
              />
            </div>
          ) : null}

          {item.kind === "working" ? <Working label={item.label} /> : null}

          {item.kind === "failed" ? (
            <div className="rise-in flex flex-wrap items-center justify-between gap-3 rounded-xl border border-bad/40 bg-surface px-4 py-3" role="alert">
              <span className="flex items-center gap-2.5 text-[14px]">
                <AlertCircle size={16} className="shrink-0 text-bad" aria-hidden="true" />
                {item.failure.message}
              </span>
              <Button size="sm" onClick={() => void dispatch(drive(turn.id))}>
                Try again
              </Button>
            </div>
          ) : null}
        </Fragment>
      ))}

      {marks.after.map((mark, at) => (
        <MarkView key={`after-${at}`} mark={mark} />
      ))}

      {turn.run && turn.run.checks.length > 0 ? (
        <ul className="rise-in flex flex-col gap-1.5 pt-1" aria-label="Checked against what you asked">
          {turn.run.checks.map((check) => (
            <li key={check.label} className="flex items-start gap-2 text-[13px] text-muted">
              {check.pass ? (
                <CircleCheck size={14} className="mt-[3px] shrink-0 text-ok" aria-hidden="true" />
              ) : (
                <CircleAlert size={14} className="mt-[3px] shrink-0 text-warn" aria-hidden="true" />
              )}
              <span>
                <span className="sr-only">{check.pass ? "Checked: " : "Differs: "}</span>
                {check.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {turn.closing ? <p className="text-[14px] text-faint">{turn.closing}</p> : null}
    </section>
  );
}
