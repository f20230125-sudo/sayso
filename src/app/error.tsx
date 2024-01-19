"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

/** Shown when the page throws. The conversation is saved in the browser, so nothing is lost. */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="text-xl font-semibold">Something went wrong on this page</h1>
      <p className="max-w-sm text-sm leading-relaxed text-muted">Your conversation is saved in this browser. Try again to pick it up where it was.</p>
      <button type="button" onClick={() => retry()} className="mt-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-accent-fg">
        Try again
      </button>
    </main>
  );
}
