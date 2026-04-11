// Records the short demo at the top of the README, and the page preview image.
//
//   npm run dev     (in one terminal)
//   npm run gif     (in another)
//
// A browser is driven through one request while every frame it draws is kept,
// and the frames become docs/demo.gif. The clock is fixed, so the recording
// comes out the same every time.

import { mkdir, stat } from "node:fs/promises";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3030";
const OUT = process.env.OUT_FILE ?? "docs/demo.gif";
const VIEW = { width: 1180, height: 720 };
const NOW = new Date("2026-10-06T10:30:00+04:00");
const SENTENCE = "Move my London flight to next week, window seat, and add a bag";

// --- Drawn on top of the page: a pointer, since a headless browser has none,
// --- and one line saying what is happening.

function overlay() {
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;font-family:ui-sans-serif,system-ui,sans-serif";
  layer.innerHTML = `
    <div id="demo-caption" style="position:absolute;left:50%;top:70px;transform:translateX(-50%);padding:8px 16px;
      border-radius:12px;background:rgba(20,23,28,.96);color:#f3f5f8;font-size:15px;
      font-weight:500;white-space:nowrap;box-shadow:0 10px 30px rgba(16,24,40,.25);display:none"></div>
    <div id="demo-pointer" style="position:absolute;left:0;top:0;width:24px;height:24px;margin:-2px 0 0 -4px">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 30 30"><path d="M5 3 L5 24 L11 18.5 L15 27 L19 25 L15 16.8 L23 16.8 Z"
        fill="#14171c" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>
    </div>`;
  document.body.appendChild(layer);
  const pointer = document.getElementById("demo-pointer");
  document.addEventListener("mousemove", (event) => {
    pointer.style.transform = `translate(${event.clientX}px, ${event.clientY}px)`;
  }, true);
  window.demoCaption = (text) => {
    const caption = document.getElementById("demo-caption");
    caption.textContent = text;
    caption.style.display = text ? "" : "none";
  };
}

const browser = await chromium.launch();

// --- The page preview image: the welcome page, at the size link previews use.
{
  const context = await browser.newContext({ viewport: { width: 1200, height: 630 }, colorScheme: "light", deviceScaleFactor: 1, timezoneId: "Asia/Dubai" });
  const page = await context.newPage();
  await page.clock.setFixedTime(NOW);
  await page.goto(BASE);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: "src/app/opengraph-image.png" });
  await context.close();
  console.log("saved src/app/opengraph-image.png");
}

// --- The tour ---------------------------------------------------------------------

const context = await browser.newContext({ viewport: VIEW, colorScheme: "light", deviceScaleFactor: 1, timezoneId: "Asia/Dubai" });
const page = await context.newPage();
await page.clock.setFixedTime(NOW);
await page.goto(BASE);
await page.getByRole("heading", { level: 1 }).waitFor();
await page.waitForTimeout(600);
await page.evaluate(overlay);

let at = { x: 590, y: 300 };
await page.mouse.move(at.x, at.y);

const wait = (ms) => page.waitForTimeout(ms);
const caption = (text) => page.evaluate((line) => window.demoCaption(line), text);

/** Glide the pointer to the middle of something, then click it. */
async function click(target) {
  await target.scrollIntoViewIfNeeded();
  const box = await target.boundingBox();
  const to = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const steps = 12;
  for (let step = 1; step <= steps; step += 1) {
    // Ease out: quick at first, slowing as it arrives.
    const part = 1 - (1 - step / steps) ** 2;
    await page.mouse.move(at.x + (to.x - at.x) * part, at.y + (to.y - at.y) * part);
    await wait(18);
  }
  at = to;
  await wait(160);
  await page.mouse.click(to.x, to.y);
}

// Keep every frame drawn from here on, with the time it was drawn.
const frames = [];
let recording = true;
const camera = (async () => {
  while (recording) frames.push({ at: Date.now(), png: await page.screenshot() });
})();

await wait(500);
await caption("Three requests in one sentence");
await click(page.getByLabel("Say what you need"));
await page.keyboard.type(SENTENCE, { delay: 24 });
await wait(350);
await page.keyboard.press("Enter");

const days = page.getByRole("region", { name: "Days to choose from" });
await days.waitFor();
await wait(900);
await caption("The reply is interface, not text: pick a day");
await click(days.getByRole("button", { name: /^Wed 14 Oct/ }));

const flights = page.getByRole("list", { name: "Flights to choose from" });
await flights.waitFor();
await wait(900);
await caption("Each answer folds into one line");
await click(flights.getByRole("button").first());

await page.getByRole("grid").waitFor();
await wait(900);
await caption("The cabin of the new flight, window seats marked");
await click(page.getByRole("button", { name: /window, free/ }).nth(2));
await wait(500);
await click(page.getByRole("button", { name: /^Choose \d/ }));

const price = page.getByRole("region", { name: "Price summary" });
await price.waitFor();
await wait(1300);
await caption("One price for all three");
await click(price.getByRole("button", { name: /^Pay / }));

await page.getByRole("region", { name: "Receipt" }).waitFor();
await wait(1500);
await caption("Checked against what was asked");
await wait(1700);

await caption("How it worked: the plan, the real API calls, the checks");
await click(page.getByRole("button", { name: "How it worked", exact: true }));
await page.getByRole("complementary", { name: "How it worked" }).waitFor();
await wait(2600);

recording = false;
await camera;
await browser.close();

// --- Frames to a GIF -------------------------------------------------------------

// Each frame stays up until the next one was drawn. Frames in which nothing
// changed are folded into the one before, which keeps the file small.
const kept = [];
frames.forEach((frame, index) => {
  const ms = (frames[index + 1]?.at ?? frame.at + 100) - frame.at;
  const last = kept[kept.length - 1];
  if (last && last.png.equals(frame.png)) last.ms += ms;
  else kept.push({ png: frame.png, ms });
});

await mkdir(OUT.split("/").slice(0, -1).join("/") || ".", { recursive: true });
await sharp(kept.map((frame) => frame.png), { join: { animated: true } })
  .gif({
    delay: kept.map((frame) => frame.ms),
    loop: 0,
    colours: 96,
    dither: 0,
    effort: 8,
    // Pixels that barely changed are left as they were in the frame before.
    interFrameMaxError: 6,
    interPaletteMaxError: 8,
  })
  .toFile(OUT);

const seconds = kept.reduce((sum, frame) => sum + frame.ms, 0) / 1000;
const { size } = await stat(OUT);
console.log(`saved ${OUT}: ${kept.length} frames, ${seconds.toFixed(1)} s, ${(size / 1_048_576).toFixed(2)} MB`);
