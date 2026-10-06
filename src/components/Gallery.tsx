"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { Catalog } from "@/agent/catalog";
import type { Example } from "@/widgets/examples";
import { WidgetHost } from "@/widgets/registry";
import { JsonTree } from "./JsonTree";
import { ThemeToggle } from "./ThemeToggle";
import { useToast } from "./toast";

// Every component the desk can build a reply from, each with a worked example
// and the schema a plan must satisfy to show it.

type Props = { examples: Example[]; widgets: Catalog["widgets"] };

export function Gallery({ examples, widgets }: Props) {
  const { showToast } = useToast();

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-line bg-bg px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted transition-colors hover:bg-surface-2 hover:text-fg">
          <ArrowLeft size={15} aria-hidden="true" />
          Back to the desk
        </Link>
        <ThemeToggle />
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[680px] px-5 pb-20 pt-10">
          <div className="eyebrow mb-3">Sayso · components</div>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight">The {widgets.length} pieces a reply is built from</h1>
          <p className="mt-3 text-[16px] leading-relaxed text-muted">
            A plan can only ask for a component on this list, and only with the properties its schema allows. Each is shown waiting for an answer and, where
            it asks for one, as the single line it folds into afterwards.
          </p>

          <nav aria-label="Components" className="mt-6 flex flex-wrap gap-2">
            {widgets.map((widget) => (
              <a
                key={widget.type}
                href={`#${widget.type}`}
                className="rounded-full border border-line bg-surface px-3 py-1 text-[13px] text-muted transition-colors hover:border-line-strong hover:text-fg"
              >
                {widget.title}
              </a>
            ))}
          </nav>

          {widgets.map((widget) => {
            const example = examples.find((entry) => entry.type === widget.type);
            return (
              <section key={widget.type} id={widget.type} aria-labelledby={`${widget.type}-title`} className="scroll-mt-6 pt-14">
                <div className="eyebrow mb-2">{widget.type}</div>
                <h2 id={`${widget.type}-title`} className="text-[22px] font-semibold tracking-tight">
                  {widget.title}
                </h2>
                <p className="mb-5 mt-1.5 text-[15px] leading-relaxed text-muted">{widget.description}</p>

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
                        <div className="eyebrow mb-2">Once answered</div>
                        <WidgetHost widget={example.type} props={example.props} state="answered" answer={example.answer} closed={false} onAnswer={() => {}} />
                      </div>
                    ) : null}
                  </div>
                ) : null}

                <details className="mt-5 rounded-xl border border-line bg-surface">
                  <summary className="cursor-pointer rounded-xl px-4 py-2.5 text-[13px] font-medium text-muted hover:text-fg">Schema</summary>
                  <div className="border-t border-line px-3 py-2">
                    <JsonTree value={widget.props} label="properties" openDepth={2} />
                    {widget.answer ? <JsonTree value={widget.answer} label="answer" openDepth={2} /> : <p className="px-1 py-1 font-mono text-[12px] text-faint">answer: none</p>}
                  </div>
                </details>
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}
