"use client";

import { Check, Circle, CircleAlert, CircleCheck, CircleDot, Minus, X } from "lucide-react";
import { describeIntent, describeStep, describeUnderstanding, progressOf, type StepProgress } from "@/agent/describe";
import type { Json } from "@/agent/reference";
import type { CallRecord, Turn } from "@/store/conversationSlice";
import { JsonTree } from "./JsonTree";
import { IconButton } from "./ui";

// The four steps behind one reply, shown as they went: what was understood,
// the plan, each call to the airline's API with the data that came back, and
// the checks at the end. Nothing here is made up for show. It is read from the
// same run that drew the reply.

function Section({ number, title, note, children }: { number: number; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line px-5 py-4">
      <h3 className="mb-3 flex items-baseline gap-2.5">
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft font-mono text-[11px] font-semibold text-accent">{number}</span>
        <span className="text-[14px] font-semibold">{title}</span>
        {note ? <span className="tabular ml-auto text-[12px] text-faint">{note}</span> : null}
      </h3>
      {children}
    </section>
  );
}

const PROGRESS_ICON: Record<StepProgress, React.ReactNode> = {
  done: <Check size={13} className="text-ok" />,
  now: <CircleDot size={13} className="text-accent" />,
  failed: <CircleAlert size={13} className="text-bad" />,
  left: <Minus size={13} className="text-faint" />,
  "to do": <Circle size={13} className="text-line-strong" />,
};

const PROGRESS_WORD: Record<StepProgress, string> = { done: "done", now: "now", failed: "failed", left: "left", "to do": "to do" };

function time(ms: number): string {
  if (ms < 1) return "under 1 ms";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`;
}

function Call({ record }: { record: CallRecord }) {
  const { call, result, failure } = record;
  const ok = call.status >= 200 && call.status < 300;
  return (
    <li className="rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <span className="mt-px shrink-0 rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-muted">{call.method}</span>
        <code className="min-w-0 flex-1 break-all font-mono text-[12px] leading-5">{call.url}</code>
      </div>
      <div className="tabular flex items-center gap-3 px-3 pb-2 pt-1 text-[12px]">
        <span className={ok ? "text-ok" : "text-bad"}>{call.status}</span>
        <span className="text-faint">{time(call.ms)}</span>
        {failure ? <span className="min-w-0 truncate text-bad">{failure.message}</span> : null}
      </div>
      {call.body !== undefined || result !== null ? (
        <div className="border-t border-line px-2 py-1.5">
          {call.body !== undefined ? <JsonTree value={call.body} label="sent" openDepth={0} /> : null}
          {result !== null ? <JsonTree value={result as Json} label="came back" openDepth={0} /> : null}
        </div>
      ) : null}
    </li>
  );
}

export function HowItWorked({ turn, onClose }: { turn: Turn | null; onClose: () => void }) {
  return (
    <aside className="flex h-full flex-col bg-bg" aria-label="How it worked">
      <header className="flex h-14 shrink-0 items-center justify-between gap-3 px-5">
        <h2 className="eyebrow">How it worked</h2>
        <IconButton label="Close how it worked" onClick={onClose}>
          <X size={16} />
        </IconButton>
      </header>

      {!turn ? (
        <p className="border-t border-line px-5 py-4 text-[14px] leading-relaxed text-muted">
          Ask for something, and this panel shows the four steps behind the reply: what was understood, the plan, each call to the airline, and the checks.
        </p>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto pb-6">
          <p className="px-5 pb-4 text-[15px] font-medium leading-snug">“{turn.words}”</p>

          <Section number={1} title="Understand" note={time(turn.understoodMs)}>
            <p className="mb-2.5 text-[13px] text-muted">
              {turn.brain === "model" && turn.model ? `Read by ${turn.model}, after the built-in rules could not.` : "Read by the built-in rules. No model was asked."}
            </p>
            {turn.intents.length > 0 ? (
              <ul className="flex flex-col gap-2">
                {turn.intents.map((intent) => {
                  const { journey, details } = describeIntent(intent);
                  return (
                    <li key={intent.journey} className="rounded-xl border border-line bg-surface px-3 py-2.5">
                      <div className="text-[13px] font-medium">{journey}</div>
                      {details.length > 0 ? (
                        <dl className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-[12px]">
                          {details.map((detail) => (
                            <div key={detail.name} className="flex gap-1.5">
                              <dt className="text-faint">{detail.name}</dt>
                              <dd>{detail.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : (
                        <div className="mt-1 text-[12px] text-faint">No details given.</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-[13px]">{describeUnderstanding(turn.understanding)}.</p>
            )}
            {turn.marks.length > 0 ? (
              <p className="mt-2.5 text-[12px] text-faint">Said partway: {turn.marks.map((mark) => `“${mark.words}”`).join(", ")}</p>
            ) : null}
          </Section>

          {turn.run ? (
            <>
              <Section number={2} title="Plan" note={`${turn.run.steps.length} steps`}>
                <ol className="flex flex-col gap-1.5">
                  {turn.run.steps.map((step, index) => {
                    const { kind, text } = describeStep(step);
                    const progress = progressOf(turn.run!, index);
                    return (
                      <li key={step.id} className={`flex items-start gap-2 text-[12.5px] leading-5 ${progress === "to do" || progress === "left" ? "text-muted" : ""}`}>
                        <span className="mt-[3px] shrink-0" aria-hidden="true">
                          {PROGRESS_ICON[progress]}
                        </span>
                        <span className="w-9 shrink-0 font-mono text-[10px] uppercase leading-5 tracking-wide text-faint">{kind}</span>
                        <span className="min-w-0 flex-1">
                          {text}
                          <span className="sr-only"> ({PROGRESS_WORD[progress]})</span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              </Section>

              <Section
                number={3}
                title="Run"
                note={turn.calls.length > 0 ? `${turn.calls.length} ${turn.calls.length === 1 ? "call" : "calls"}, ${time(turn.calls.reduce((sum, record) => sum + record.call.ms, 0))}` : undefined}
              >
                {turn.calls.length > 0 ? (
                  <ul className="flex flex-col gap-2">
                    {turn.calls.map((record, index) => (
                      <Call key={`${record.stepId}-${index}`} record={record} />
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">No calls to the airline yet.</p>
                )}
              </Section>

              <Section number={4} title="Check">
                {turn.run.checks.length > 0 ? (
                  <ul className="flex flex-col gap-1.5">
                    {turn.run.checks.map((check) => (
                      <li key={check.label} className="flex items-start gap-2 text-[12.5px] leading-5">
                        {check.pass ? (
                          <CircleCheck size={13} className="mt-[3px] shrink-0 text-ok" aria-hidden="true" />
                        ) : (
                          <CircleAlert size={13} className="mt-[3px] shrink-0 text-warn" aria-hidden="true" />
                        )}
                        {check.label}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-[13px] text-muted">
                    {turn.run.status === "done" ? "Nothing was changed, so there was nothing to check." : "The checks run once the journey is finished."}
                  </p>
                )}
              </Section>
            </>
          ) : null}
        </div>
      )}
    </aside>
  );
}
