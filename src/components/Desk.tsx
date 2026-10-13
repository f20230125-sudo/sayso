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
import { buildsLine } from "@/widgets/builds";
import { TripCard } from "@/widgets/TripCard";
import { WIDGETS, type WidgetType } from "@/widgets/specs";
import { AskBar } from "./AskBar";
import { askInput, focusFirstIn, focusIsFree, requestHandOff, takeHandOff } from "./focus";
import { HowItWorked } from "./HowItWorked";
import { Logo } from "./Logo";
import { SettingsDialog } from "./SettingsDialog";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./toast";
import { Said, TurnView, Working } from "./TurnView";
import { IconButton } from "./ui";

// The whole page: a bar across the top, the conversation as a docket down the
// left, and one input at the bottom. "How it worked" opens as a carbon copy at
// the right.

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

type Try = { words: string; builds: string | null };

/** Each sentence, and under it the components it builds, worked out from the real plan. */
function Suggestions({ tries, onAsk }: { tries: Try[]; onAsk: (words: string) => void }) {
  return (
    <ul aria-label="Things to try">
      {tries.map(({ words, builds }, index) => (
        <li
          key={words}
          className="relative border-b border-rule transition-colors duration-150 first:border-t hover:bg-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ink"
        >
          {/* The whole row answers a click: the button's own box stretches over it. */}
          <button
            type="button"
            onClick={() => onAsk(words)}
            aria-describedby={builds ? `builds-${index}` : undefined}
            className="block min-h-14 w-full px-1 pt-3 text-left text-[17px] leading-snug after:absolute after:inset-0 after:content-[''] focus-visible:outline-none"
          >
            {words}
          </button>
          {builds ? (
            <p id={`builds-${index}`} className="px-1 pb-3 pt-0.5 text-[13px] leading-snug text-ink-3">
              {builds}
            </p>
          ) : (
            <div className="pb-3" />
          )}
        </li>
      ))}
    </ul>
  );
}

function Welcome({ account, today, onAsk }: { account: Account; today: string; onAsk: (words: string) => void }) {
  const [next] = upcoming(account, today);
  const first = account.traveller.name.split(" ")[0];
  const tries = useMemo(() => {
    const now = new Date();
    return suggestions(account, today, now).map((words) => ({ words, builds: buildsLine(words, account, today, now) }));
  }, [account, today]);

  return (
    // The columns follow the room this has, not the screen: with "How it worked" open there is less of it.
    <div className="@container">
      <div className="grid gap-y-6 pt-2 sm:gap-y-8 sm:pt-8 @min-[700px]:grid-cols-2 @min-[700px]:grid-rows-[auto_1fr] @min-[700px]:gap-x-8 @min-[700px]:[grid-template-areas:'head_pass'_'list_pass'] @min-[1000px]:gap-x-12 @min-[1150px]:grid-cols-[minmax(0,600px)_minmax(0,1fr)] @min-[1150px]:gap-x-16">
        <header className="@min-[700px]:[grid-area:head]">
          <h1 className="text-[38px] font-bold leading-[1.04] tracking-[-0.02em] sm:text-[52px]">Hello, {first}.</h1>
          <p className="mt-3 max-w-[31ch] text-[16px] leading-[1.5] text-ink-2 sm:mt-4 sm:text-[18px]">
            Say what you need in your own words. The right screen for it builds itself here.
          </p>
        </header>

        {next ? (
          <div className="@min-[700px]:[grid-area:pass]">
            <TripCard booking={next} hero />
          </div>
        ) : null}

        <section className="@min-[700px]:[grid-area:list]">
          <h2 className="mb-1.5 text-[15px] font-bold">Or start from one of these</h2>
          <Suggestions tries={tries} onAsk={onAsk} />
        </section>
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
  const welcome = turns.length === 0 && !pending;

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

  // A component was answered by touching it, and the next one has arrived: the
  // keyboard goes with it, unless the traveller has gone somewhere else.
  const waitingId = waiting?.id ?? null;
  useEffect(() => {
    if (!waitingId || !takeHandOff()) return;
    const open = document.querySelectorAll("[data-widget-active]");
    const form = open.item(open.length - 1);
    if (form && focusIsFree(form)) focusFirstIn(form);
  }, [waitingId]);

  const onAsk = (words: string) => void dispatch(ask(words));
  // A sentence was chosen from the list, which is about to leave: the keyboard goes to the ask bar, then on to the first form.
  const onTry = (words: string) => {
    requestHandOff();
    askInput()?.focus();
    onAsk(words);
  };

  const column = `mx-auto w-full max-w-[1280px] px-5 md:px-10 ${panelOpen ? "xl:pl-[120px]" : ""}`;

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-rule bg-floor px-3 sm:px-6">
        <div className="flex items-center gap-4 pl-1">
          <Logo />
          <span className="hidden text-[14px] text-ink-3 sm:inline">{AIRLINE.name} demo desk</span>
        </div>
        <div className="flex items-center gap-0.5 sm:gap-1">
          {account ? <span className="mr-3 hidden text-[14px] text-ink-2 sm:inline">{account.traveller.name}</span> : null}
          <IconButton
            id="how-toggle"
            label={panelOpen ? "Close how it worked" : "How it worked"}
            aria-pressed={panelOpen}
            className={panelOpen ? "bg-ink text-paper hover:bg-ink hover:text-paper" : ""}
            onClick={() => dispatch(panelOpen ? uiActions.panelClosed() : uiActions.panelOpened(null))}
          >
            <ListTree size={18} />
          </IconButton>
          <Link
            href="/gallery"
            aria-label="Component gallery"
            title="Component gallery"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors duration-150 hover:bg-paper-2 hover:text-ink"
          >
            <LayoutGrid size={18} />
          </Link>
          <IconButton label={model ? `Language model: ${model}` : "Language model: none, built-in rules only"} onClick={() => dispatch(settingsActions.settingsOpened())}>
            <span className="relative">
              <Sparkles size={18} />
              {model ? <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-[2px] border border-mark-edge bg-mark" aria-hidden="true" /> : null}
            </span>
          </IconButton>
          <IconButton
            label="Start over with fresh demo trips"
            onClick={() => {
              dispatch(startOver());
              showToast("Started over with fresh demo trips.");
            }}
          >
            <RotateCcw size={18} />
          </IconButton>
          <ThemeToggle />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none">
            <div className={`${column} pb-10 pt-6 sm:pt-8`}>
              {!account ? null : welcome ? (
                <Welcome account={account} today={today} onAsk={onTry} />
              ) : (
                <div className="flex max-w-[800px] flex-col gap-12">
                  <h1 className="sr-only">Your conversation with the {AIRLINE.name} desk</h1>
                  {turns.map((turn) => (
                    <TurnView key={turn.id} turn={turn} />
                  ))}
                  {pending ? (
                    <section className="flex flex-col gap-4" aria-label={`You said: ${pending.words}`}>
                      <Said words={pending.words} />
                      <Working label={`Asking ${model ?? "the model"} what that means`} />
                    </section>
                  ) : null}
                </div>
              )}
              <div ref={end} aria-hidden="true" />
            </div>
          </main>

          <div className="shrink-0 bg-floor pb-4 pt-2 sm:pb-5">
            <div className={column}>
              <div className={welcome ? (panelOpen ? "max-w-[600px]" : "min-[780px]:max-w-[calc(50%-1rem)] min-[1020px]:max-w-[calc(50%-1.5rem)] min-[1230px]:max-w-[600px]") : "max-w-[800px]"}>
                <AskBar
                  busy={busy}
                  hint={waiting ? (WAITING_HINTS[waiting.widget] ?? "Choose above, or say what you need") : "Say what you need"}
                  onAsk={onAsk}
                  onStop={() => dispatch(stop())}
                />
                <p className="mt-2 text-[12.5px] leading-snug text-ink-3">A demo. {AIRLINE.name} is made up and nothing here is really booked or charged.</p>
              </div>
            </div>
          </div>
        </div>

        {/* The carbon copy: beside the conversation on a wide screen, over it on a narrow one. */}
        {panelOpen ? (
          <div className="fixed inset-0 z-40 bg-paper-2 lg:static lg:z-auto lg:w-[400px] lg:shrink-0 lg:border-l-2 lg:border-dashed lg:border-edge">
            <HowItWorked
              turn={shownInPanel}
              onClose={() => {
                dispatch(uiActions.panelClosed());
                // The button that closes it leaves with it: the keyboard goes back to the one that opens it.
                document.getElementById("how-toggle")?.focus();
              }}
            />
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
