"use client";

import { RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { suggestions } from "@/agent/replies";
import { waitingStep } from "@/agent/run";
import { upcoming } from "@/airline/account";
import { localDay } from "@/airline/dates";
import { AIRLINE } from "@/airline/places";
import type { Account } from "@/airline/schema";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { ask, startOver, stop } from "@/store/thunks";
import { TripCard } from "@/widgets/TripCard";
import type { WidgetType } from "@/widgets/specs";
import { AskBar } from "./AskBar";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./toast";
import { TurnView } from "./TurnView";
import { IconButton } from "./ui";

// The whole page: a bar across the top, the conversation down the middle, and
// one input at the bottom.

/** What the input suggests while a component waits: the same answer can be typed. */
const WAITING_HINTS: Partial<Record<WidgetType, string>> = {
  "trip-chooser": 'Pick a trip above, or name it: "the London one"',
  "seat-map": 'Pick a seat above, or type one: "14A"',
  "price-summary": 'Confirm above, or say "yes"',
};

function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-[13px] font-bold text-accent-fg" aria-hidden="true">
        S
      </span>
      <span className="text-[15px] font-semibold tracking-tight">Sayso</span>
    </span>
  );
}

function Suggestions({ tries, onAsk }: { tries: string[]; onAsk: (words: string) => void }) {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Things to try">
      {tries.map((words) => (
        <li key={words}>
          <button
            type="button"
            onClick={() => onAsk(words)}
            className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg"
          >
            {words}
          </button>
        </li>
      ))}
    </ul>
  );
}

function Welcome({ account, today, onAsk }: { account: Account; today: string; onAsk: (words: string) => void }) {
  const [next] = upcoming(account, today);
  const first = account.traveller.name.split(" ")[0];
  return (
    <div className="flex flex-col gap-8 pt-6 sm:pt-12">
      <header className="rise-in">
        <div className="eyebrow mb-3">{AIRLINE.name} · demo desk</div>
        <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight sm:text-[40px]">Hello, {first}.</h1>
        <p className="mt-3 max-w-md text-[17px] leading-relaxed text-muted">
          Say what you need in your own words. The right screen for it builds itself here.
        </p>
      </header>

      {next ? (
        <div className="rise-in" style={{ animationDelay: "60ms" }}>
          <div className="eyebrow mb-2.5">Your next trip</div>
          <TripCard booking={next} />
        </div>
      ) : null}

      <div className="rise-in" style={{ animationDelay: "120ms" }}>
        <div className="eyebrow mb-2.5">Try asking</div>
        <Suggestions tries={suggestions(account, today)} onAsk={onAsk} />
      </div>
    </div>
  );
}

export function Desk() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const account = useAppSelector((state) => state.account.account);
  const turns = useAppSelector((state) => state.conversation.turns);
  const today = useMemo(() => localDay(new Date()), []);

  const last = turns.at(-1);
  const busy = last?.run?.status === "running";
  const waiting = waitingStep(last?.run ?? null);

  // Keep the newest thing in view as the conversation grows.
  const end = useRef<HTMLDivElement>(null);
  const progress = `${turns.length}:${last?.run?.at ?? 0}:${last?.run?.status ?? ""}:${last?.marks.length ?? 0}`;
  useEffect(() => {
    if (turns.length > 0) end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    // `progress` stands for everything that makes the page longer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const onAsk = (words: string) => void dispatch(ask(words));

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-bg px-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-1">
          {account ? (
            <span className="mr-2 hidden items-center gap-2 text-[13px] text-muted sm:flex">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-2 text-[11px] font-semibold text-fg" aria-hidden="true">
                {account.traveller.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </span>
              {account.traveller.name}
            </span>
          ) : null}
          <IconButton
            label="Start over with fresh demo trips"
            onClick={() => {
              dispatch(startOver());
              showToast("Started over with fresh demo trips.");
            }}
          >
            <RotateCcw size={16} />
          </IconButton>
          <ThemeToggle />
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[680px] flex-col gap-12 px-5 pb-10 pt-8">
          {!account ? null : turns.length === 0 ? (
            <Welcome account={account} today={today} onAsk={onAsk} />
          ) : (
            turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
          )}
          <div ref={end} aria-hidden="true" />
        </div>
      </main>

      <div className="shrink-0 bg-bg px-5 pb-5 pt-2">
        <div className="mx-auto w-full max-w-[680px]">
          <AskBar
            busy={busy}
            hint={waiting ? (WAITING_HINTS[waiting.widget] ?? "Choose above, or say what you need") : "Say what you need"}
            onAsk={onAsk}
            onStop={() => last && dispatch(stop(last.id))}
          />
          <p className="mt-2 text-center text-[11px] text-faint">A demo. {AIRLINE.name} is made up and nothing here is really booked or charged.</p>
        </div>
      </div>
    </div>
  );
}
