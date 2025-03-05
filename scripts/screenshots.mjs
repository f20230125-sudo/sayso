// Takes the pictures the README uses, from the running app.
//
//   npm run dev          (in another terminal)
//   npm run screenshots
//
// The clock is fixed so the demo trips fall on the same days every time the
// pictures are retaken.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3030";
const OUT = "docs/screenshots";
const NOW = new Date("2026-10-06T10:30:00+04:00");
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

async function open({ width, height, theme, scale = 2 }) {
  const context = await browser.newContext({ viewport: { width, height }, colorScheme: theme, deviceScaleFactor: scale, timezoneId: "Asia/Dubai" });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(BASE);
  await page.getByRole("heading", { level: 1 }).waitFor();
  const say = async (words) => {
    await page.getByLabel("Say what you need").fill(words);
    await page.keyboard.press("Enter");
  };
  const save = async (name) => {
    // Let the last thing finish arriving, and take the pointer off the page.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(700);
    await page.screenshot({ path: join(OUT, `${name}.png`) });
    console.log(`saved ${name}.png`);
  };
  return { page, say, save, close: () => context.close() };
}

const SENTENCE = "Move my London flight to next week, window seat, and add a bag";

/** The three-part sentence, as far as the seat map on the new flight. */
async function toSeatMap(page, say) {
  await say(SENTENCE);
  await page.getByRole("region", { name: "Days to choose from" }).getByRole("button", { name: /^Wed 14 Oct/ }).click();
  await page.getByRole("list", { name: "Flights to choose from" }).getByRole("button").first().click();
  await page.getByRole("grid").waitFor();
}

// 1. The desk partway through a journey, with "How it worked" open beside it.
{
  const { page, say, save, close } = await open({ width: 1440, height: 900, theme: "light" });
  await toSeatMap(page, say);
  await page.getByRole("button", { name: /window, free/ }).nth(2).click();
  await page.getByRole("button", { name: "How it worked", exact: true }).click();
  await page.getByRole("complementary", { name: "How it worked" }).waitFor();
  await save("desk");
  await close();
}

// 2. The end of the same journey, in the dark theme: one receipt, and the checks.
{
  const { page, say, save, close } = await open({ width: 1280, height: 900, theme: "dark" });
  await toSeatMap(page, say);
  await page.getByRole("button", { name: /window, free/ }).nth(2).click();
  await page.getByRole("button", { name: /^Choose \d/ }).click();
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.getByRole("region", { name: "Receipt" }).waitFor();
  await save("receipt-dark");
  await close();
}

// 3. The welcome page.
{
  const { save, close } = await open({ width: 1280, height: 800, theme: "light" });
  await save("welcome");
  await close();
}

// 4. On a phone: checking in, down to the boarding pass.
{
  const { page, say, save, close } = await open({ width: 390, height: 844, theme: "light", scale: 3 });
  await say("Check me in");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Check in" }).click();
  await page.getByRole("region", { name: "Boarding pass" }).waitFor();
  await save("phone");
  await close();
}

// 5. The gallery of components.
{
  const { page, save, close } = await open({ width: 1280, height: 900, theme: "light" });
  await page.goto(`${BASE}/gallery#date-strip`);
  await page.getByRole("heading", { name: "Days" }).waitFor();
  await save("gallery");
  await close();
}

await browser.close();
