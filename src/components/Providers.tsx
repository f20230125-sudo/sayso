"use client";

import { LazyMotion, MotionConfig, domAnimation } from "motion/react";
import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { makeStore } from "@/store/store";
import { start } from "@/store/thunks";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";

/** Everything the app shares: the Redux store, the theme and toasts. */
export function Providers({ children }: { children: React.ReactNode }) {
  // One store for the life of the page. The server has no browser storage and
  // no visitor, so there the store stays empty.
  const [store] = useState(() => {
    const inBrowser = typeof window !== "undefined";
    return makeStore({
      storage: inBrowser ? window.localStorage : null,
      fetch: (...args) => fetch(...args),
      now: () => new Date(),
      clock: () => performance.now(),
      controllers: new Map(),
    });
  });

  // The account and the conversation are read after the first paint. The
  // server cannot know them, so the first paint must match what it sent.
  useEffect(() => {
    store.dispatch(start());
  }, [store]);

  return (
    <Provider store={store}>
      <ThemeProvider>
        {/* Animations are loaded once, and switched off for anyone whose device asks for less motion. */}
        <LazyMotion features={domAnimation} strict>
          <MotionConfig reducedMotion="user">
            <ToastProvider>{children}</ToastProvider>
          </MotionConfig>
        </LazyMotion>
      </ThemeProvider>
    </Provider>
  );
}
