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

  const round = "flex h-11 w-11 shrink-0 items-center justify-center rounded-control transition-colors duration-150";

  return (
    <form
      className="ring-within flex min-h-[60px] items-center gap-1.5 rounded-form border-[1.5px] border-ink bg-paper p-2 pl-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (canSend) send(words);
      }}
    >
      <input
        ref={input}
        data-ask-input=""
        value={words}
        onChange={(event) => setWords(event.target.value)}
        placeholder={speech.listening ? "Listening…" : hint}
        aria-label="Say what you need"
        autoComplete="off"
        enterKeyHint="send"
        maxLength={300}
        className="ring-on-parent h-11 min-w-0 flex-1 bg-transparent text-[16px] text-ink placeholder:text-ink-3 sm:text-[17px]"
      />

      {speech.supported && !busy ? (
        <button
          type="button"
          onClick={speech.listening ? speech.stop : speech.start}
          aria-label={speech.listening ? "Stop listening" : "Speak"}
          aria-pressed={speech.listening}
          title={speech.listening ? "Stop listening" : "Speak"}
          className={`${round} ${speech.listening ? "bg-ink text-paper" : "text-ink-2 hover:bg-paper-2 hover:text-ink"}`}
        >
          <Mic size={18} />
        </button>
      ) : null}

      {busy ? (
        <button type="button" onClick={onStop} aria-label="Stop" title="Stop" className={`${round} border-[1.5px] border-ink bg-paper text-ink hover:bg-paper-2`}>
          <Square size={14} fill="currentColor" />
        </button>
      ) : (
        <button
          type="submit"
          aria-disabled={!canSend || undefined}
          aria-label="Send"
          title="Send"
          className={`${round} border-[1.5px] border-mark-edge bg-mark text-on-mark hover:shadow-[inset_0_0_0_1px_var(--mark-edge)] aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-edge aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:shadow-none`}
        >
          <ArrowUp size={19} strokeWidth={2.25} />
        </button>
      )}
    </form>
  );
}
