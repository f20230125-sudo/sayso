// A quick look at the running app: drives the journeys and saves a picture of
// each stage. For checking the look by eye while building.
//
//   node scripts/look.mjs [light|dark] [width] [journey]
//
// Needs the app on http://127.0.0.1:3030. Pictures go to the folder named in
// LOOK_DIR, or ./.look.

import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { chromium } from "@playwright/test";

const theme = process.argv[2] === "dark" ? "dark" : "light";
const width = Number(process.argv[3] ?? 1280);
const only = process.argv[4] ?? "all";
const out = process.env.LOOK_DIR ?? ".look";
mkdirSync(out, { recursive: true });

const browser = await chromium.launch();
const problems = [];

async function journey(name, steps) {
  if (only !== "all" && only !== name) return;
  const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme });
  page.on("console", (message) => {
    if (message.type() === "error") problems.push(`${name}: ${message.text()}`);
  });
  page.on("pageerror", (error) => problems.push(`${name}: ${error}`));

  let shot = 0;
  const snap = async (label) => {
    shot += 1;
    await page.waitForTimeout(500);
    await page.screenshot({ path: join(out, `${theme}-${width}-${name}-${String(shot).padStart(2, "0")}-${label}.png`) });
  };
  const say = async (words) => {
    await page.getByLabel("Say what you need").fill(words);
    await page.keyboard.press("Enter");
  };

  await page.goto("http://127.0.0.1:3030/");
  await page.getByRole("heading", { level: 1 }).waitFor();
  try {
    await steps({ page, say, snap });
  } catch (error) {
    problems.push(`${name}: ${String(error).split("\n")[0]}`);
    await snap("stuck");
  }
  await page.close();
}

await journey("welcome", async ({ snap }) => {
  await snap("welcome");
});

await journey("three", async ({ page, say, snap }) => {
  await say("Move my London flight to next week, window seat, and add a bag");
  await page.getByRole("region", { name: "Days to choose from" }).waitFor();
  await snap("days");
  await page.getByRole("region", { name: "Days to choose from" }).getByRole("button").nth(2).click();
  await page.getByRole("list", { name: "Flights to choose from" }).waitFor();
  await snap("flights");
  await page.getByRole("list", { name: "Flights to choose from" }).getByRole("button").first().click();
  await page.getByRole("grid").waitFor();
  await snap("seats");
  await page.getByRole("button", { name: /window, free/ }).first().click();
  await page.getByRole("button", { name: /^Choose \d/ }).click();
  await page.getByRole("region", { name: "Price summary" }).waitFor();
  await snap("price");
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.getByRole("region", { name: "Receipt" }).waitFor();
  await snap("receipt");
});

await journey("checkin", async ({ page, say, snap }) => {
  await say("Check me in for Mumbai");
  await page.getByRole("region", { name: "Passenger check" }).waitFor();
  await snap("passenger");
  for (const box of await page.getByRole("checkbox").all()) await box.check();
  await page.getByRole("button", { name: "Check in" }).click();
  await page.getByRole("region", { name: "Boarding pass" }).waitFor();
  await snap("pass");
});

await journey("status", async ({ page, say, snap }) => {
  await say("Is my flight on time?");
  await page.getByRole("region", { name: /^Status of/ }).waitFor();
  await snap("status");
});

await journey("book", async ({ page, say, snap }) => {
  await say("Book a flight");
  await page.getByRole("form", { name: "Flight search" }).waitFor();
  await snap("search");
  await say("Paris next Friday");
  await page.getByRole("list", { name: "Flights to choose from" }).waitFor();
  await snap("flights");
  await say("the cheapest");
  await page.getByRole("region", { name: "Price summary" }).waitFor();
  await snap("price");
  await say("yes");
  await page.getByRole("region", { name: "Receipt" }).waitFor();
  await snap("receipt");
});

await journey("cancel", async ({ page, say, snap }) => {
  await say("Cancel my Istanbul trip");
  await page.getByRole("region", { name: "Refund" }).waitFor();
  await snap("refund");
  await page.getByRole("button", { name: /^Cancel booking/ }).click();
  await page.getByRole("region", { name: "Receipt" }).waitFor();
  await snap("receipt");
});

await journey("bags", async ({ page, say, snap }) => {
  await say("I need more bags");
  await page.getByRole("list", { name: "Your trips" }).waitFor();
  await say("the Istanbul one");
  await page.getByRole("region", { name: "Checked bags" }).waitFor();
  await snap("stepper");
});

await journey("panel", async ({ page, say, snap }) => {
  await say("Move my London flight to next week, window seat, and add a bag");
  await page.getByRole("region", { name: "Days to choose from" }).getByRole("button").nth(2).click();
  await page.getByRole("list", { name: "Flights to choose from" }).getByRole("button").first().click();
  await page.getByRole("grid").waitFor();
  await page.getByRole("button", { name: "How it worked", exact: true }).click();
  await page.getByRole("complementary", { name: "How it worked" }).waitFor();
  await snap("waiting");
  await page.getByRole("button", { name: /window, free/ }).first().click();
  await page.getByRole("button", { name: /^Choose \d/ }).click();
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.getByRole("region", { name: "Receipt" }).waitFor();
  await page.getByRole("button", { name: "Open came back" }).first().click();
  await snap("done");
});

await browser.close();
console.log(problems.length === 0 ? "no problems" : `problems:\n${problems.join("\n")}`);
