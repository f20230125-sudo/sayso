import { describe, expect, it } from "vitest";
import { memoryStorage } from "@/test/api";
import { EXTRA_TRIES, ModelError, complete, createStreamReader, stream, type ChatDeps, type Message } from "./chat";
import { AI_STORAGE_KEY, NO_AI, errorMessage, listModels, loadAiConfig, presetConfig, storeAiConfig, toAiSettings } from "./settings";

const ai = { baseUrl: "https://model.test/v1/", apiKey: "k-123", model: "small-one" };
const messages: Message[] = [{ role: "user", content: "hello" }];

type Call = { url: string; body: Record<string, unknown>; authorization: string | null };

/** A stand-in for the provider: answers each call with the next response in the list. */
function provider(responses: (Response | Error)[]): { deps: ChatDeps; calls: Call[]; waits: number[] } {
  const calls: Call[] = [];
  const waits: number[] = [];
  const deps: ChatDeps = {
    signal: new AbortController().signal,
    sleep: async (ms) => void waits.push(ms),
    fetch: async (url, init) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body)), authorization: new Headers(init?.headers).get("authorization") });
      const next = responses.shift();
      if (!next) throw new Error("No more responses were prepared.");
      if (next instanceof Error) throw next;
      return next;
    },
  };
  return { deps, calls, waits };
}

const reply = (content: unknown) => Response.json({ choices: [{ message: { content } }] });
const busy = () => Response.json({ error: { message: "The model is overloaded." } }, { status: 503 });
const sse = (...lines: string[]) => new Response(lines.join("\n\n") + "\n\n");
const delta = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;

describe("asking for a whole reply", () => {
  it("sends the model, the messages and the key, and returns the text", async () => {
    const { deps, calls } = provider([reply("Hi there.")]);
    expect(await complete(ai, messages, deps)).toBe("Hi there.");
    expect(calls).toEqual([{ url: "https://model.test/v1/chat/completions", body: { model: "small-one", messages }, authorization: "Bearer k-123" }]);
  });

  it("asks for JSON when told to, and sends no key when there is none", async () => {
    const { deps, calls } = provider([reply("{}")]);
    await complete({ ...ai, apiKey: "" }, messages, deps, { json: true });
    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    expect(calls[0].authorization).toBeNull();
  });

  it("tries again while the service says it is busy, waiting longer each time", async () => {
    const { deps, calls, waits } = provider([busy(), busy(), reply("At last.")]);
    expect(await complete(ai, messages, deps)).toBe("At last.");
    expect(calls).toHaveLength(3);
    expect(waits).toEqual([1200, 2400]);
  });

  it("gives up after the extra tries, and says what the service said", async () => {
    const { deps, calls } = provider(Array.from({ length: EXTRA_TRIES + 1 }, busy));
    await expect(complete(ai, messages, deps)).rejects.toMatchObject({
      code: "refused",
      message: "The model's service answered 503 after 3 tries. The model is overloaded. Another model in Settings may be less busy.",
    });
    expect(calls).toHaveLength(EXTRA_TRIES + 1);
  });

  it("does not try again when the key is refused", async () => {
    const { deps, calls } = provider([Response.json([{ error: { message: "API key not valid." } }], { status: 400 })]);
    await expect(complete(ai, messages, deps)).rejects.toMatchObject({ code: "refused", message: "The model's service answered 400. API key not valid." });
    expect(calls).toHaveLength(1);
  });

  it("reports an empty reply and an unreachable service in plain words", async () => {
    await expect(complete(ai, messages, provider([reply("  ")]).deps)).rejects.toMatchObject({ code: "empty" });
    await expect(complete(ai, messages, provider([Response.json({})]).deps)).rejects.toMatchObject({ code: "empty" });
    const offline = complete(ai, messages, provider([new TypeError("Failed to fetch")]).deps);
    await expect(offline).rejects.toBeInstanceOf(ModelError);
    await expect(offline).rejects.toMatchObject({ code: "network" });
  });

  it("stops at once when the caller stops it", async () => {
    const controller = new AbortController();
    const deps: ChatDeps = {
      signal: controller.signal,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("stopped", "AbortError")));
          controller.abort();
        }),
    };
    await expect(complete(ai, messages, deps)).rejects.toMatchObject({ name: "AbortError" });
  });
});

describe("reading a reply as it arrives", () => {
  it("joins the pieces of text and knows when the reply is done", () => {
    const reader = createStreamReader();
    expect(reader.read(`${delta("A bag ")}\n\n${delta("costs AED 120.")}\n\n`)).toBe("A bag costs AED 120.");
    expect(reader.done()).toBe(false);
    expect(reader.read("data: [DONE]\n\n")).toBe("");
    expect(reader.done()).toBe(true);
  });

  it("copes with a line split across two chunks", () => {
    const reader = createStreamReader();
    const line = `${delta("Check-in opens 48 hours before.")}\n`;
    expect(reader.read(line.slice(0, 31))).toBe("");
    expect(reader.read(line.slice(31))).toBe("Check-in opens 48 hours before.");
  });

  it("skips lines that carry no text", () => {
    const reader = createStreamReader();
    expect(reader.read(": keep-alive\n\ndata: not json\n\nevent: ping\n\ndata: {\"choices\":[{\"delta\":{}}]}\n\n" + delta("Yes.") + "\r\n")).toBe("Yes.");
  });

  it("hands each piece over as it comes, and returns the whole", async () => {
    const pieces: string[] = [];
    const { deps, calls } = provider([sse(delta("One cabin bag "), delta("is included."), "data: [DONE]")]);
    expect(await stream(ai, messages, deps, (piece) => pieces.push(piece))).toBe("One cabin bag is included.");
    expect(pieces.join("")).toBe("One cabin bag is included.");
    expect(calls[0].body.stream).toBe(true);
  });

  it("reports a stream with no text in it, and a refusal", async () => {
    await expect(stream(ai, messages, provider([sse("data: [DONE]")]).deps, () => {})).rejects.toMatchObject({ code: "empty" });
    await expect(stream(ai, messages, provider([Response.json({ error: "No such model." }, { status: 404 })]).deps, () => {})).rejects.toMatchObject({
      code: "refused",
      message: "The model's service answered 404. No such model.",
    });
  });
});

describe("the model settings", () => {
  it("are enough to call a model only when address, model and key are all there", () => {
    expect(toAiSettings(NO_AI)).toBeNull();
    expect(toAiSettings(presetConfig("gemini"))).toBeNull(); // no key yet
    expect(toAiSettings(presetConfig("gemini", " k "))).toEqual({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKey: "k",
      model: "gemini-3.5-flash-lite",
    });
    // A model on your own machine needs no key.
    expect(toAiSettings({ provider: "custom", baseUrl: "http://localhost:11434/v1/", apiKey: "", model: "llama" })).toEqual({
      baseUrl: "http://localhost:11434/v1",
      apiKey: "",
      model: "llama",
    });
    expect(toAiSettings({ provider: "custom", baseUrl: "", apiKey: "", model: "llama" })).toBeNull();
  });

  it("are kept in the browser, and forgotten when the model is switched off", () => {
    const storage = memoryStorage();
    const config = presetConfig("groq", "k");
    storeAiConfig(storage, config);
    expect(loadAiConfig(storage)).toEqual(config);
    storeAiConfig(storage, NO_AI);
    expect(storage.data.has(AI_STORAGE_KEY)).toBe(false);
    expect(loadAiConfig(memoryStorage({ [AI_STORAGE_KEY]: "{broken" }))).toEqual(NO_AI);
    expect(loadAiConfig(null)).toEqual(NO_AI);
  });

  it("reads what went wrong in each shape providers send it", () => {
    expect(errorMessage({ error: { message: "a" } })).toBe("a");
    expect(errorMessage([{ error: { message: "b" } }])).toBe("b");
    expect(errorMessage({ error: "c" })).toBe("c");
    expect(errorMessage({ nothing: true })).toBeNull();
    expect(errorMessage(null)).toBeNull();
  });

  it("checks a key by asking which models it can use", async () => {
    const config = presetConfig("gemini", "k");
    const working: typeof fetch = async () => Response.json({ data: [{ id: "models/b" }, { id: "a" }, { id: 7 }] });
    expect(await listModels(config, working)).toEqual({ ok: true, models: ["a", "b"] });
    expect(await listModels(config, async () => Response.json({}, { status: 401 }))).toEqual({
      ok: false,
      message: "The service refused the key. Check that it is complete and still active.",
    });
    expect(await listModels({ ...config, baseUrl: " " })).toEqual({ ok: false, message: "Enter the service's address first." });
    expect(
      await listModels(config, async () => {
        throw new TypeError("offline");
      }),
    ).toEqual({ ok: false, message: "Could not reach the service. Check the address." });
  });
});
