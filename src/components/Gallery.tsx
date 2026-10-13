"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Catalog } from "@/agent/catalog";
import type { Example } from "@/widgets/examples";
import { WidgetHost } from "@/widgets/registry";
import { JsonTree } from "./JsonTree";
import { LogoMark } from "./Logo";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./toast";

// Every component the desk can build a reply from, each with a worked example
// and the schema a plan must satisfy to show it. A catalogue of forms: the
// form first, then its caption.

type Props = { examples: Example[]; widgets: Catalog["widgets"] };

export function Gallery({ examples, widgets }: Props) {
  const { showToast } = useToast();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-rule bg-floor px-3 sm:px-6">
        <Link
          href="/"
          className="flex min-h-10 items-center gap-2.5 rounded-control px-2 text-[15px] font-bold text-ink-2 transition-colors duration-150 hover:bg-paper-2 hover:text-ink"
        >
          <ArrowLeft size={17} aria-hidden="true" />
          <LogoMark className="hidden sm:block" />
          Back to the desk
        </Link>
        <ThemeToggle />
      </header>

      <main id="main" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus-visible:outline-none">
        <div className="mx-auto w-full max-w-[1280px] px-5 pb-20 pt-8 md:px-10 md:pt-12">
          <div className="max-w-[800px]">
            <h1 className="text-[34px] font-bold leading-[1.06] tracking-[-0.02em] sm:text-[44px]">The {widgets.length} pieces a reply is built from</h1>
            <p className="mt-4 max-w-[62ch] text-[16px] leading-[1.55] text-ink-2">
              A plan can only ask for a component on this list, and only with the properties its schema allows. Each is shown waiting for an answer and, where
              it asks for one, as the single line it folds into afterwards.
            </p>

            <nav aria-label="Components" className="mt-8">
              <ul className="grid gap-x-10 border-t border-rule sm:grid-cols-2">
                {widgets.map((widget) => (
                  <li key={widget.type} className="border-b border-rule">
                    <a href={`#${widget.type}`} className="flex min-h-11 items-center px-1 py-2 text-[16px] transition-colors duration-150 hover:bg-paper hover:underline hover:underline-offset-4">
                      {widget.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>

            {widgets.map((widget) => {
              const example = examples.find((entry) => entry.type === widget.type);
              return (
                <section key={widget.type} id={widget.type} aria-labelledby={`${widget.type}-title`} className="scroll-mt-6 pt-16">
                  {example ? (
                    <div className="flex flex-col gap-4">
                      <WidgetHost
                        widget={example.type}
                        props={example.props}
                        state={example.answer === null ? "shown" : "active"}
                        answer={null}
                        closed={false}
                        onAnswer={() => showToast("In a conversation, that answer would carry the journey on.")}
                      />
                      {example.answer !== null ? (
                        <div>
                          <WidgetHost widget={example.type} props={example.props} state="answered" answer={example.answer} closed={false} onAnswer={() => {}} />
                          <p className="mt-1 text-[12.5px] text-ink-3">Once answered</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}

                  <h2 id={`${widget.type}-title`} className="mt-5 text-[22px] font-bold leading-tight tracking-[-0.01em]">
                    {widget.title}
                  </h2>
                  <p className="mt-1 max-w-[62ch] text-ink-2">{widget.description}</p>

                  <details className="mt-3">
                    <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
                      <span className="font-bold underline underline-offset-4">Schema</span>
                      <code className="font-mono text-[12.5px] text-ink-3">{widget.type}</code>
                    </summary>
                    <div className="mt-2 border-t border-rule pt-2">
                      <JsonTree value={widget.props} label="properties" openDepth={2} />
                      {widget.answer ? <JsonTree value={widget.answer} label="answer" openDepth={2} /> : <code className="block px-1 py-1 font-mono text-[12px] text-ink-3">answer: none</code>}
                    </div>
                  </details>
                </section>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
