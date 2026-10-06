import { expect, test, type Page } from "@playwright/test";
import { cabin, openDesk, say } from "./helpers";

// The desk with a model switched on. The provider is replaced with a stand-in,
// so these tests never touch the network and need no key.

const MODEL = "gemini-3.5-flash-lite";
const PROVIDER = "https://generativelanguage.googleapis.com/**";

/** Give the browser a saved model, as if the visitor had set one up earlier. */
async function withModel(page: Page): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key, value),
    ["sayso:ai", JSON.stringify({ provider: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", apiKey: "test-key", model: MODEL })],
  );
}

type Asked = { body: { stream?: boolean; messages: { role: string; content: string }[] }; key: string | null }[];

/** Answer the provider's calls: `reads` for what a sentence means, `says` for an answer in words. */
async function provider(page: Page, reads: unknown, says = ""): Promise<Asked> {
  const asked: Asked = [];
  await page.route(PROVIDER, async (route) => {
    const body = route.request().postDataJSON() as Asked[number]["body"];
    asked.push({ body, key: await route.request().headerValue("authorization") });
    if (body.stream) {
      const pieces = says.split(/(?<= )/).map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: `${pieces.join("")}data: [DONE]\n\n` });
    } else {
      await route.fulfill({ status: 200, json: { choices: [{ message: { content: JSON.stringify(reads) } }] } });
    }
  });
  return asked;
}

test.describe("with a model", () => {
  test("a sentence the rules cannot read is put to the model, and its reading is carried out", async ({ page }) => {
    await withModel(page);
    const asked = await provider(page, { kind: "request", intents: [{ journey: "seat", wish: "window", trip: "K7QM2P" }] });
    await openDesk(page);
    await say(page, "I'd love to look out at the clouds on the way to London");

    await expect(cabin(page)).toBeVisible();
    await expect(page.getByText("Here is the cabin on JN 203 to London. Free window seats are marked.")).toBeVisible();
    await expect(page.getByText(new RegExp(`^Understood by ${MODEL} in \\d`))).toBeVisible();

    // One call, with the visitor's own key, telling the model the date and the trips.
    expect(asked).toHaveLength(1);
    expect(asked[0].key).toBe("Bearer test-key");
    expect(asked[0].body.messages[0].content).toContain("TODAY: Tuesday 2026-10-06");
    expect(asked[0].body.messages[0].content).toContain("K7QM2P: JN 203, Dubai to London");
    expect(asked[0].body.messages[1].content).toBe("I'd love to look out at the clouds on the way to London");
  });

  test("a sentence the rules can read never reaches the model", async ({ page }) => {
    await withModel(page);
    const asked = await provider(page, { kind: "unknown" });
    await openDesk(page);
    await say(page, "Show my trips");
    await expect(page.getByText("You have 3 trips coming up.")).toBeVisible();
    await expect(page.getByText(/^Understood by the built-in rules in \d/)).toBeVisible();
    expect(asked).toHaveLength(0);
  });

  test("a question is answered in words, marked as written by the model", async ({ page }) => {
    await withModel(page);
    const asked = await provider(page, { kind: "talk" }, "Pets are not something this desk can arrange.");
    await openDesk(page);
    await say(page, "am I allowed to bring my cat?");

    await expect(page.getByText("Pets are not something this desk can arrange.")).toBeVisible();
    await expect(page.getByText(`Written by ${MODEL}, from the airline's rules`)).toBeVisible();
    expect(asked).toHaveLength(2);
    expect(asked[1].body.stream).toBe(true);
    expect(asked[1].body.messages[0].content).toContain("Use only the facts below.");
  });

  test("the words appear at once, and the wait can be stopped", async ({ page }) => {
    await withModel(page);
    await page.route(PROVIDER, () => {
      // Never answered: the model stays "busy" until the visitor stops it.
    });
    await openDesk(page);
    await say(page, "something only a model could read");
    await expect(page.getByText("something only a model could read")).toBeVisible();
    await expect(page.getByRole("status").filter({ hasText: `Asking ${MODEL} what that means` })).toBeVisible();

    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Noor." })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("a model that cannot be reached is said plainly, and the desk carries on", async ({ page }) => {
    await withModel(page);
    await page.route(PROVIDER, (route) => route.fulfill({ status: 400, json: [{ error: { message: "API key not valid." } }] }));
    await openDesk(page);
    await say(page, "something only a model could read");
    await expect(page.getByText(/The model could not help: The model's service answered 400\. API key not valid\./)).toBeVisible();
    await say(page, "show my trips");
    await expect(page.getByText("You have 3 trips coming up.")).toBeVisible();
  });
});

test.describe("the model settings", () => {
  test("a key is saved in this browser, checked against the provider, and can be removed", async ({ page }) => {
    await page.route(PROVIDER, (route) => route.fulfill({ status: 200, json: { data: [{ id: "models/gemini-3.5-flash-lite" }, { id: "models/gemini-3.8-flash" }] } }));
    await openDesk(page);
    await page.getByRole("button", { name: "Language model: none, built-in rules only" }).click();

    const dialog = page.getByRole("dialog", { name: "Language model" });
    await dialog.getByLabel("Provider").selectOption("gemini");
    await dialog.getByLabel("API key").fill("my-own-key");
    await dialog.getByRole("button", { name: "Check key" }).click();
    await expect(dialog.getByText(/The key works\. It can use 2 models/)).toBeVisible();
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(`The desk will ask ${MODEL} when its rules cannot read a sentence.`)).toBeVisible();
    await expect(page.getByRole("button", { name: `Language model: ${MODEL}` })).toBeVisible();
    expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("sayso:ai") ?? "{}").apiKey)).toBe("my-own-key");

    // It is still there after a reload, and gone once switched off.
    await page.reload();
    await page.getByRole("button", { name: `Language model: ${MODEL}` }).click();
    await page.getByRole("dialog").getByLabel("Provider").selectOption("none");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("The desk will use its built-in rules only.")).toBeVisible();
    expect(await page.evaluate(() => window.localStorage.getItem("sayso:ai"))).toBeNull();
  });

  test("starting over keeps the model the visitor chose", async ({ page }) => {
    await withModel(page);
    await openDesk(page);
    await page.getByRole("button", { name: "Start over with fresh demo trips" }).click();
    await expect(page.getByRole("button", { name: `Language model: ${MODEL}` })).toBeVisible();
  });
});
