"use client";

import { ArrowUp, Square } from "lucide-react";
import { useRef, useState } from "react";

// The one input of the whole desk.

type Props = {
  /** A reply is on its way: sending waits, and the button stops it instead. */
  busy: boolean;
  /** What the input says when it is empty. It changes with what the desk is waiting for. */
  hint: string;
  onAsk: (words: string) => void;
  onStop: () => void;
};

export function AskBar({ busy, hint, onAsk, onStop }: Props) {
  const [words, setWords] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const canSend = words.trim() !== "" && !busy;

  return (
    <form
      className="ring-within flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-lift transition-[border-color,box-shadow]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSend) return;
        onAsk(words);
        setWords("");
        input.current?.focus();
      }}
    >
      <input
        ref={input}
        value={words}
        onChange={(event) => setWords(event.target.value)}
        placeholder={hint}
        aria-label="Say what you need"
        autoComplete="off"
        enterKeyHint="send"
        maxLength={300}
        className="ring-on-parent h-10 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint"
      />
      {busy ? (
        <button
          type="button"
          onClick={onStop}
          aria-label="Stop"
          title="Stop"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-2 text-fg transition-colors hover:bg-line"
        >
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          title="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-fg transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint"
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}
