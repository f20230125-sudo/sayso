// A quick look at the running app: drives one journey and saves a picture of
// each stage. For checking the look by eye while building.
//
//   node scripts/look.mjs [light|dark] [width]
//
// Needs the app on http://127.0.0.1:3030. Pictures go to the folder named in
// LOOK_DIR, or ./.look.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const theme = process.argv[2] === "dark" ? "dark" : "light";
const width = Number(process.argv[3] ?? 1280);
const out = process.env.LOOK_DIR ?? ".look";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width, height: 860 }, colorScheme: theme });
const problems = [];
page.on("console", (message) => {
  if (message.type() === "error") problems.push(message.text());
});
page.on("pageerror", (error) => problems.push(String(error)));

let shot = 0;
const snap = async (name) => {
  shot += 1;
  await page.waitForTimeout(450);
  await page.screenshot({ path: join(out, `${theme}-${width}-${String(shot).padStart(2, "0")}-${name}.png`) });
};

await page.goto("http://127.0.0.1:3030/");
await page.getByRole("heading", { level: 1 }).waitFor();
await snap("welcome");

const say = async (words) => {
  await page.getByLabel("Say what you need").fill(words);
  await page.keyboard.press("Enter");
};

await say("Show my trips");
await page.getByRole("article").first().waitFor();
await snap("trips");

await say("give me a window seat");
await page.getByRole("list", { name: "Your trips" }).waitFor();
await snap("which-trip");

await page.getByRole("button", { name: /London/ }).click();
await page.getByRole("grid").waitFor();
await snap("seat-map");

await page.getByRole("button", { name: /window, free/ }).first().click();
await snap("seat-picked");
await page.getByRole("button", { name: /^Choose \d/ }).click();
await page.getByRole("region", { name: "Price summary" }).waitFor();
await snap("price");

await page.getByRole("button", { name: /^Pay / }).click();
await page.getByRole("region", { name: "Receipt" }).waitFor();
await snap("receipt");

await browser.close();
console.log(problems.length === 0 ? "no console errors" : `console errors:\n${problems.join("\n")}`);
