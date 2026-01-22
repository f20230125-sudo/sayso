import { expect, type Locator, type Page } from "@playwright/test";

// What the end-to-end tests share.
//
// The demo trips are dated from the visitor's "today", so every test fixes
// the browser's clock first: Tuesday 6 October 2026, 10:30 in Dubai. The
// trips are then Mumbai tomorrow, London on Thursday the 8th and Istanbul on
// Saturday the 24th, every time.

export const NOW = new Date("2026-10-06T10:30:00+04:00");

/** Open the desk with the clock fixed and nothing remembered. */
export async function openDesk(page: Page): Promise<void> {
  await page.clock.setFixedTime(NOW);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hello, Noor." })).toBeVisible();
}

export async function say(page: Page, words: string): Promise<void> {
  await page.getByLabel("Say what you need").fill(words);
  await page.keyboard.press("Enter");
}

export const days = (page: Page) => page.getByRole("region", { name: "Days to choose from" });
export const flights = (page: Page) => page.getByRole("list", { name: "Flights to choose from" });
export const cabin = (page: Page) => page.getByRole("grid");
export const price = (page: Page) => page.getByRole("region", { name: "Price summary" });
export const receipt = (page: Page) => page.getByRole("region", { name: "Receipt" });
export const checks = (page: Page) => page.getByRole("list", { name: "Checked against what you asked" });

/** The first free seat of a kind in the cabin on screen. */
export const freeSeat = (page: Page, kind: string): Locator => cabin(page).getByRole("button", { name: new RegExp(`, ${kind}, free`) }).first();

/** The one line a component folds into once it has been answered. */
export const folded = (page: Page, text: string | RegExp) => page.getByText(text);

/** Pick the first free seat of a kind and confirm it. */
export async function chooseSeat(page: Page, kind: string): Promise<string> {
  const seat = freeSeat(page, kind);
  const name = ((await seat.getAttribute("aria-label")) ?? "").split(",")[0];
  await seat.click();
  await page.getByRole("button", { name: `Choose ${name}` }).click();
  return name;
}
