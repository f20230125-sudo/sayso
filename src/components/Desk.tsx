"use client";

import { LayoutGrid, ListTree, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef } from "react";
import { suggestions } from "@/agent/replies";
import { waitingStep } from "@/agent/run";
import { upcoming } from "@/airline/account";
import { localDay } from "@/airline/dates";
import { AIRLINE } from "@/airline/places";
import type { Account } from "@/airline/schema";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { settingsActions } from "@/store/settingsSlice";
import { ask, isBusy, startOver, stop } from "@/store/thunks";
import { uiActions } from "@/store/uiSlice";
import { TripCard } from "@/widgets/TripCard";
import { WIDGETS, type WidgetType } from "@/widgets/specs";
import { AskBar } from "./AskBar";
import { HowItWorked } from "./HowItWorked";
import { SettingsDialog } from "./SettingsDialog";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./toast";
import { Said, TurnView, Working } from "./TurnView";
import { IconButton } from "./ui";

// The whole page: a bar across the top, the conversation down the middle, and
// one input at the bottom.

/** What the input suggests while a component waits: the same answer can be typed. */
const WAITING_HINTS: Partial<Record<WidgetType, string>> = {
  "trip-chooser": 'Pick a trip above, or name it: "the London one"',
  "flight-search": 'Fill it in above, or say it: "Paris next Friday"',
  "date-strip": 'Pick a day above, or name one: "Thursday"',
  "flight-list": 'Pick a flight above, or say "the earliest" or "the cheapest"',
  "seat-map": 'Pick a seat above, or type one: "14A"',
  "bag-stepper": 'Choose above, or say how many: "two"',
  "passenger-check": "Tick both boxes above to check in",
  refund: 'Confirm above, or say "yes". Say "never mind" to keep the booking',
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
        <Suggestions tries={suggestions(account, today, new Date())} onAsk={onAsk} />
      </div>
    </div>
  );
}

export function Desk() {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const account = useAppSelector((state) => state.account.account);
  const turns = useAppSelector((state) => state.conversation.turns);
  const pending = useAppSelector((state) => state.conversation.pending);
  const model = useAppSelector((state) => (state.settings.ai.provider === "none" ? null : state.settings.ai.model));
  const busy = useAppSelector(isBusy);
  const panelOpen = useAppSelector((state) => state.ui.panelOpen);
  const panelTurn = useAppSelector((state) => state.ui.panelTurn);
  const today = useMemo(() => localDay(new Date()), []);

  const last = turns.at(-1);
  const waiting = waitingStep(last?.run ?? null);
  const shownInPanel = turns.find((turn) => turn.id === panelTurn) ?? last ?? null;

  // One short line for screen readers each time the page changes, so a new
  // component is announced without reading all of it out.
  const announcement = pending
    ? "Working out what that means."
    : waiting
      ? `${WIDGETS[waiting.widget].title} is on screen, waiting for your answer.`
      : last?.run?.status === "running"
        ? "Working."
        : last?.run?.status === "done"
          ? "Done."
          : last?.run?.status === "failed"
            ? "That did not work. You can try again."
            : "";

  // Keep the newest thing in view as the conversation grows.
  const end = useRef<HTMLDivElement>(null);
  const progress = `${turns.length}:${last?.run?.at ?? 0}:${last?.run?.status ?? ""}:${last?.marks.length ?? 0}:${pending ? 1 : 0}:${last?.reply?.length ?? 0}`;
  useEffect(() => {
    if (turns.length === 0 && !pending) return;
    const scroll = () => end.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    scroll();
    // Once more after a component has finished folding, which changes the height.
    const settled = setTimeout(scroll, 480);
    return () => clearTimeout(settled);
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
            label={panelOpen ? "Close how it worked" : "How it worked"}
            aria-pressed={panelOpen}
            className={panelOpen ? "bg-surface-2 text-fg" : ""}
            onClick={() => dispatch(panelOpen ? uiActions.panelClosed() : uiActions.panelOpened(null))}
          >
            <ListTree size={16} />
          </IconButton>
          <Link
            href="/gallery"
            aria-label="Component gallery"
            title="Component gallery"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <LayoutGrid size={16} />
          </Link>
          <IconButton label={model ? `Language model: ${model}` : "Language model: none, built-in rules only"} onClick={() => dispatch(settingsActions.settingsOpened())}>
            <span className="relative">
              <Sparkles size={16} />
              {model ? <span className="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-ok" aria-hidden="true" /> : null}
            </span>
          </IconButton>
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

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-[680px] flex-col gap-12 px-5 pb-10 pt-8">
              {!account ? null : turns.length === 0 && !pending ? (
                <Welcome account={account} today={today} onAsk={onAsk} />
              ) : (
                turns.map((turn) => <TurnView key={turn.id} turn={turn} />)
              )}
              {pending ? (
                <section className="flex flex-col gap-4" aria-label={`You said: ${pending.words}`}>
                  <Said words={pending.words} />
                  <Working label={`Asking ${model ?? "the model"} what that means`} />
                </section>
              ) : null}
              <div ref={end} aria-hidden="true" />
            </div>
          </main>

          <div className="shrink-0 bg-bg px-5 pb-5 pt-2">
            <div className="mx-auto w-full max-w-[680px]">
              <AskBar
                busy={busy}
                hint={waiting ? (WAITING_HINTS[waiting.widget] ?? "Choose above, or say what you need") : "Say what you need"}
                onAsk={onAsk}
                onStop={() => dispatch(stop())}
              />
              <p className="mt-2 text-center text-[11px] text-faint">A demo. {AIRLINE.name} is made up and nothing here is really booked or charged.</p>
            </div>
          </div>
        </div>

        {/* Beside the conversation on a wide screen, over it on a narrow one. */}
        {panelOpen ? (
          <div className="fixed inset-0 z-40 lg:static lg:z-auto lg:w-[400px] lg:shrink-0 lg:border-l lg:border-line">
            <HowItWorked turn={shownInPanel} onClose={() => dispatch(uiActions.panelClosed())} />
          </div>
        ) : null}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
      <SettingsDialog />
    </div>
  );
}
