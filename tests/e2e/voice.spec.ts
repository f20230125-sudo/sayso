import { expect, test, type Page } from "@playwright/test";
import { openDesk } from "./helpers";

// Speaking instead of typing. A test cannot talk, and a test browser has no
// speech service to listen with, so the browser's speech recognition is
// replaced with a stand-in that "hears" a sentence a moment after it starts.
// What is tested is everything Sayso does with what the browser heard.

/** Replace the browser's speech recognition. `heard` is said in two halves, as real speech arrives. */
async function hear(page: Page, heard: string | { error: string }): Promise<void> {
  await page.addInitScript((script) => {
    class Stand {
      lang = "";
      interimResults = false;
      continuous = false;
      onresult: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;

      start() {
        if (typeof script !== "string") {
          setTimeout(() => {
            this.onerror?.({ error: script.error });
            this.onend?.();
          }, 50);
          return;
        }
        const half = script.slice(0, Math.ceil(script.length / 2));
        const said = (transcript: string, isFinal: boolean) => ({ resultIndex: 0, results: [{ isFinal, 0: { transcript } }] });
        setTimeout(() => this.onresult?.(said(half, false)), 150);
        setTimeout(() => this.onresult?.(said(script, true)), 500);
        setTimeout(() => this.onend?.(), 650);
      }
      stop() {
        this.onend?.();
      }
      abort() {}
    }
    Object.assign(window, { SpeechRecognition: Stand, webkitSpeechRecognition: Stand });
  }, heard);
}

test.describe("by voice", () => {
  test("what is said is shown as it is heard, then sent as if typed", async ({ page }) => {
    await hear(page, "show my trips");
    await openDesk(page);
    await page.getByRole("button", { name: "Speak" }).click();

    await expect(page.getByRole("button", { name: "Stop listening" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByLabel("Say what you need")).toHaveAttribute("placeholder", "Listening…");
    // The first half arrives before the rest.
    await expect(page.getByLabel("Say what you need")).toHaveValue("show my");

    await expect(page.getByText("You have 3 trips coming up.")).toBeVisible();
    await expect(page.getByLabel("Say what you need")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Speak" })).toHaveAttribute("aria-pressed", "false");
  });

  test("a microphone that is not allowed is said plainly", async ({ page }) => {
    await hear(page, { error: "not-allowed" });
    await openDesk(page);
    await page.getByRole("button", { name: "Speak" }).click();
    await expect(page.getByText("The browser is not allowed to use the microphone. Allow it in the address bar to speak.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Speak" })).toBeVisible();
  });

  test("there is no microphone in a browser that cannot listen", async ({ page }) => {
    await page.addInitScript(() => {
      // As in Firefox, which has no speech recognition.
      Reflect.deleteProperty(window, "SpeechRecognition");
      Reflect.deleteProperty(window, "webkitSpeechRecognition");
    });
    await openDesk(page);
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Speak" })).toHaveCount(0);
  });
});
