"use client";

import { ArrowUp, Mic, Square } from "lucide-react";
import { useRef, useState } from "react";
import { useToast } from "./toast";
import { useSpeech } from "./useSpeech";

// The one input of the whole desk. What is said into the microphone, where
// the browser can listen, is treated exactly as if it had been typed.

type Props = {
  /** A reply is on its way: sending waits, and the button stops it instead. */
  busy: boolean;
  /** What the input says when it is empty. It changes with what the desk is waiting for. */
  hint: string;
  onAsk: (words: string) => void;
  onStop: () => void;
};

export function AskBar({ busy, hint, onAsk, onStop }: Props) {
  const { showToast } = useToast();
  const [words, setWords] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const canSend = words.trim() !== "" && !busy;

  const send = (said: string) => {
    onAsk(said);
    setWords("");
    input.current?.focus();
  };

  const speech = useSpeech({
    onHearing: setWords,
    onSaid: send,
    onTrouble: (message) => showToast(message, { tone: "bad" }),
  });

  const round = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors";

  return (
    <form
      className="ring-within flex items-center gap-2 rounded-2xl border border-line bg-surface p-2 pl-4 shadow-lift transition-[border-color,box-shadow]"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) send(words);
      }}
    >
      <input
        ref={input}
        value={words}
        onChange={(event) => setWords(event.target.value)}
        placeholder={speech.listening ? "Listening…" : hint}
        aria-label="Say what you need"
        autoComplete="off"
        enterKeyHint="send"
        maxLength={300}
        className="ring-on-parent h-10 min-w-0 flex-1 bg-transparent text-[15px] placeholder:text-faint"
      />

      {speech.supported && !busy ? (
        <button
          type="button"
          onClick={speech.listening ? speech.stop : speech.start}
          aria-label={speech.listening ? "Stop listening" : "Speak"}
          aria-pressed={speech.listening}
          title={speech.listening ? "Stop listening" : "Speak"}
          className={`${round} ${speech.listening ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-2 hover:text-fg"}`}
        >
          <Mic size={17} className={speech.listening ? "working-dot" : ""} />
        </button>
      ) : null}

      {busy ? (
        <button type="button" onClick={onStop} aria-label="Stop" title="Stop" className={`${round} bg-surface-2 text-fg hover:bg-line`}>
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Send"
          title="Send"
          className={`${round} bg-accent text-accent-fg hover:opacity-90 disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-faint`}
        >
          <ArrowUp size={18} />
        </button>
      )}
    </form>
  );
}
