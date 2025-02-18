import { errorMessage, type AiSettings } from "./settings";

// One caller for every provider: they all speak the "chat completions" API.
//
// Two ways to ask. `complete` waits for the whole reply, and is used where the
// reply is data to be checked before anything is shown. `stream` hands over
// the reply piece by piece, and is used where the reply is words to read.

export type Message = { role: "system" | "user" | "assistant"; content: string };

export type ChatDeps = {
  fetch: typeof fetch;
  signal: AbortSignal;
  /** Wait, but give up at once when the signal fires. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
};

/** A call to a model that did not work, in words fit to show. */
export class ModelError extends Error {
  readonly code: "network" | "timeout" | "refused" | "empty";

  constructor(code: ModelError["code"], message: string) {
    super(message);
    this.name = "ModelError";
    this.code = code;
  }
}

export const TIMEOUT_MS = 60_000;
/** A model that is busy says so at once, and often is not a moment later. */
export const BUSY_STATUSES: ReadonlySet<number> = new Set([429, 502, 503, 504]);
export const EXTRA_TRIES = 2;
export const FIRST_WAIT_MS = 600;

function abortError(): DOMException {
  return new DOMException("The call was stopped.", "AbortError");
}

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(abortError());
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortError());
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/** A signal that fires when the caller's does, or when the time limit passes. */
function limited(signal: AbortSignal): { signal: AbortSignal; timedOut: () => boolean; clear: () => void } {
  const controller = new AbortController();
  let late = false;
  const timer = setTimeout(() => {
    late = true;
    controller.abort();
  }, TIMEOUT_MS);
  const onAbort = () => controller.abort();
  if (signal.aborted) controller.abort();
  else signal.addEventListener("abort", onAbort, { once: true });
  return {
    signal: controller.signal,
    timedOut: () => late,
    clear: () => {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    },
  };
}

function request(ai: AiSettings, messages: Message[], extra: Record<string, unknown>): { url: string; init: RequestInit } {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (ai.apiKey !== "") headers.Authorization = `Bearer ${ai.apiKey}`;
  return {
    url: `${ai.baseUrl.replace(/\/+$/, "")}/chat/completions`,
    init: { method: "POST", headers, body: JSON.stringify({ model: ai.model, messages, ...extra }) },
  };
}

function refusal(status: number, data: unknown, statusText: string, tries: number): ModelError {
  const reason = errorMessage(data) ?? statusText;
  const after = tries > 1 ? ` after ${tries} tries` : "";
  const hint = BUSY_STATUSES.has(status) ? " Another model in Settings may be less busy." : "";
  return new ModelError("refused", `${`The model's service answered ${status}${after}. ${reason}`.trim()}${hint}`);
}

/** Send the request, trying again a few times while the service says it is busy. */
async function send(ai: AiSettings, messages: Message[], extra: Record<string, unknown>, deps: ChatDeps, signal: AbortSignal): Promise<Response> {
  const { url, init } = request(ai, messages, extra);
  const wait = deps.sleep ?? sleep;
  for (let tries = 1; ; tries += 1) {
    let response: Response;
    try {
      response = await deps.fetch(url, { ...init, signal });
    } catch (problem) {
      if (deps.signal.aborted) throw problem;
      throw new ModelError("network", "Could not reach the model's service. Check the address in Settings.");
    }
    if (response.ok) return response;
    if (!BUSY_STATUSES.has(response.status) || tries > EXTRA_TRIES) {
      throw refusal(response.status, await response.json().catch(() => null), response.statusText, tries);
    }
    await wait(FIRST_WAIT_MS * 2 ** tries, deps.signal);
  }
}

/** Ask, and wait for the whole reply. With `json`, the model is told to reply with one JSON object. */
export async function complete(ai: AiSettings, messages: Message[], deps: ChatDeps, options: { json?: boolean } = {}): Promise<string> {
  const limit = limited(deps.signal);
  try {
    const response = await send(ai, messages, options.json ? { response_format: { type: "json_object" } } : {}, deps, limit.signal);
    const data = (await response.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
    if (limit.signal.aborted) throw abortError();
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string" || text.trim() === "") throw new ModelError("empty", "The model sent back no text.");
    return text;
  } catch (problem) {
    if (deps.signal.aborted) throw problem;
    if (limit.timedOut()) throw new ModelError("timeout", `The model did not answer within ${TIMEOUT_MS / 1000} seconds.`);
    throw problem;
  } finally {
    limit.clear();
  }
}

/**
 * The text in a streamed reply. The stream is a run of lines, each "data: "
 * followed by a small JSON object, ending with "data: [DONE]". A line can
 * arrive split across two chunks, so whatever is left unfinished at the end of
 * one chunk is kept and joined to the start of the next.
 */
export function createStreamReader(): { read: (chunk: string) => string; done: () => boolean } {
  let rest = "";
  let finished = false;
  return {
    done: () => finished,
    read(chunk) {
      const lines = (rest + chunk).split(/\r?\n/);
      rest = lines.pop() ?? "";
      let text = "";
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          finished = true;
          continue;
        }
        try {
          const piece = (JSON.parse(payload) as { choices?: { delta?: { content?: unknown } }[] }).choices?.[0]?.delta?.content;
          if (typeof piece === "string") text += piece;
        } catch {
          // A line that is not JSON carries no text. Skip it and keep reading.
        }
      }
      return text;
    },
  };
}

/**
 * Ask, and hand the reply over as it arrives. `onText` is called with each
 * new piece. The whole text is returned at the end.
 */
export async function stream(ai: AiSettings, messages: Message[], deps: ChatDeps, onText: (piece: string) => void): Promise<string> {
  const limit = limited(deps.signal);
  try {
    const response = await send(ai, messages, { stream: true }, deps, limit.signal);
    if (!response.body) throw new ModelError("empty", "The model sent back no text.");

    const reader = createStreamReader();
    const decoder = new TextDecoder();
    const body = response.body.getReader();
    let whole = "";
    for (;;) {
      const { done, value } = await body.read();
      if (done) break;
      const piece = reader.read(decoder.decode(value, { stream: true }));
      if (piece !== "") {
        whole += piece;
        onText(piece);
      }
    }
    if (whole.trim() === "") throw new ModelError("empty", "The model sent back no text.");
    return whole;
  } catch (problem) {
    if (deps.signal.aborted) throw problem;
    if (limit.timedOut()) throw new ModelError("timeout", `The model did not answer within ${TIMEOUT_MS / 1000} seconds.`);
    if (problem instanceof ModelError) throw problem;
    throw new ModelError("network", "The reply from the model was cut off.");
  } finally {
    limit.clear();
  }
}
