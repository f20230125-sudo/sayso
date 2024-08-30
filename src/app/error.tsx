"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";
import { LogoMark } from "@/components/Logo";

/** Shown when the page throws. The conversation is saved in the browser, so nothing is lost. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" tabIndex={-1} className="mx-auto flex h-full w-full max-w-[1280px] flex-col justify-center gap-4 px-5 py-10 md:px-10">
      <LogoMark />
      <h1 className="max-w-[20ch] text-[34px] font-bold leading-[1.06] tracking-[-0.02em] sm:text-[44px]">Something went wrong on this page</h1>
      <p className="max-w-[44ch] text-ink-2">Your conversation is saved in this browser. Try again to pick it up where it was.</p>
      <div>
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-11 items-center justify-center rounded-control border-[1.5px] border-mark-edge bg-mark px-5 text-[15px] font-bold text-on-mark hover:shadow-[inset_0_0_0_1px_var(--mark-edge)]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
