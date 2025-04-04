"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Saying it out loud.
//
// Some browsers can turn speech into text themselves (Chrome, Edge and Safari
// do; Firefox does not). Where that exists, the ask bar grows a microphone.
// Nothing is recorded or sent anywhere by Sayso: the browser does the
// listening and hands back words, which are then treated as if typed.

// The parts of the browser's speech recognition this file uses. TypeScript's
// own DOM types do not include them yet.
type SpeechResult = { isFinal: boolean; 0: { transcript: string } };
type SpeechEvent = { resultIndex: number; results: ArrayLike<SpeechResult> };
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type RecognitionClass = new () => Recognition;

function recognitionClass(): RecognitionClass | null {
  if (typeof window === "undefined") return null;
  const holder = window as unknown as { SpeechRecognition?: RecognitionClass; webkitSpeechRecognition?: RecognitionClass };
  return holder.SpeechRecognition ?? holder.webkitSpeechRecognition ?? null;
}

type Options = {
  /** Called as words are heard, with everything heard so far. */
  onHearing: (words: string) => void;
  /** Called once when the speaker stops, with what was said. Not called if nothing was heard. */
  onSaid: (words: string) => void;
  /** Called when listening fails, with words fit to show. */
  onTrouble: (message: string) => void;
};

const TROUBLE: Record<string, string> = {
  "not-allowed": "The browser is not allowed to use the microphone. Allow it in the address bar to speak.",
  "service-not-allowed": "The browser is not allowed to use the microphone. Allow it in the address bar to speak.",
  "audio-capture": "No microphone was found.",
  network: "The browser could not reach its speech service. Type it instead.",
};

/** A browser either can listen or cannot: that never changes while the page is open. */
const neverChanges = () => () => {};

export function useSpeech({ onHearing, onSaid, onTrouble }: Options) {
  // Whether the browser can listen is only known in the browser. The server
  // answers "no", and React corrects that once the page is running.
  const supported = useSyncExternalStore(
    neverChanges,
    () => recognitionClass() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const handlers = useRef({ onHearing, onSaid, onTrouble });

  useEffect(() => {
    handlers.current = { onHearing, onSaid, onTrouble };
  });

  useEffect(() => () => recognition.current?.abort(), []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  const start = useCallback(() => {
    const Recogniser = recognitionClass();
    if (!Recogniser) return;
    recognition.current?.abort();

    const listener = new Recogniser();
    listener.lang = "en-US";
    listener.interimResults = true;
    listener.continuous = false;
    let heard = "";

    listener.onresult = (event) => {
      heard = Array.from(event.results, (result) => result[0].transcript).join(" ").replace(/\s+/g, " ").trim();
      handlers.current.onHearing(heard);
    };
    listener.onerror = (event) => {
      // "no-speech" and "aborted" are not failures: the speaker said nothing, or stopped.
      const message = TROUBLE[event.error];
      if (message) handlers.current.onTrouble(message);
    };
    listener.onend = () => {
      setListening(false);
      recognition.current = null;
      if (heard !== "") handlers.current.onSaid(heard);
    };

    recognition.current = listener;
    setListening(true);
    try {
      listener.start();
    } catch {
      setListening(false);
      recognition.current = null;
    }
  }, []);

  return { supported, listening, start, stop };
}
