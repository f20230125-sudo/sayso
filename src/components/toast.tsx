"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CircleAlert, X } from "lucide-react";
import { askInput } from "./focus";

// Short messages that appear under the header and leave by themselves. A toast
// can carry one action, such as "Undo".

type Toast = {
  id: number;
  message: string;
  tone: "neutral" | "bad";
  action?: { label: string; run: () => void };
};

type ToastOptions = { tone?: Toast["tone"]; action?: Toast["action"]; durationMs?: number };

type ToastContextValue = { showToast: (message: string, options?: ToastOptions) => void };

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    // If the keyboard was on this toast, it goes back to the page and not to nowhere.
    const hadFocus = document.activeElement?.closest(`[data-toast="${id}"]`) != null;
    setToasts((current) => current.filter((toast) => toast.id !== id));
    if (hadFocus) requestAnimationFrame(() => (askInput() ?? document.getElementById("main"))?.focus());
  }, []);

  const showToast = useCallback(
    (message: string, options: ToastOptions = {}) => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-2), { id, message, tone: options.tone ?? "neutral", action: options.action }]);
      setTimeout(() => dismiss(id), options.durationMs ?? (options.action ? 7000 : 4000));
    },
    [dismiss],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-4 top-16 z-50 flex flex-col items-end gap-2 sm:left-auto sm:right-6" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            data-toast={toast.id}
            className={`pointer-events-auto flex max-w-full items-center gap-3 rounded-control border-[1.5px] bg-paper py-1.5 pl-4 pr-1.5 text-[14px] text-ink shadow-[var(--shadow-overlay)] ${
              toast.tone === "bad" ? "border-bad" : "border-ink"
            }`}
          >
            {toast.tone === "bad" ? <CircleAlert size={17} className="shrink-0 text-bad" aria-hidden="true" /> : null}
            <span className="py-1">{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className="min-h-8 rounded-seat px-2 font-bold underline underline-offset-4 hover:bg-paper-2"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" aria-label="Dismiss" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-seat text-ink-2 hover:bg-paper-2 hover:text-ink" onClick={() => dismiss(toast.id)}>
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside <ToastProvider>.");
  return value;
}
