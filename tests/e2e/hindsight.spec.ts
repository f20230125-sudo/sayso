import { expect, test } from "@playwright/test";
import { cabin, openDesk, say } from "./helpers";

// The "Open in Hindsight" button in the How it worked panel. Hindsight itself
// is not reached: a page is put in its place, at its address, that does what
// Hindsight's page does.

const HINDSIGHT = "https://hindsight-sand.vercel.app";

const STAND_IN = `<!doctype html><title>Hindsight</title><script>
  window.addEventListener("message", (event) => {
    window.__received = event.data;
    window.opener.postMessage({ type: "hindsight:received" }, event.origin);
  });
  window.opener.postMessage({ type: "hindsight:ready" }, "*");
</script>`;

async function openPanelAfterARun(page: import("@playwright/test").Page) {
  await openDesk(page);
  await say(page, "a window seat on my London flight");
  await expect(cabin(page)).toBeVisible();
  await page.getByRole("button", { name: "How it worked", exact: true }).click();
}

test("hands the run to Hindsight in a new tab, and says so", async ({ page, context }) => {
  await context.route(`${HINDSIGHT}/open`, (route) => route.fulfill({ contentType: "text/html", body: STAND_IN }));
  await openPanelAfterARun(page);

  const opened = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Open in Hindsight" }).click();
  const popup = await opened;

  await expect(page.getByText("Opened in Hindsight.")).toBeVisible();
  const received = await popup.evaluate(() => (window as unknown as { __received: unknown }).__received);
  expect(received).toMatchObject({
    format: "hindsight/run",
    version: 1,
    app: "sayso",
    data: { words: "a window seat on my London flight", status: "waiting", brain: "rules" },
  });
  // The data is the data on screen: the real call, and the order things happened in.
  const { data } = received as { data: { calls: { url: string }[]; log: { type: string }[] } };
  expect(data.calls.map((call) => call.url)).toEqual(["/api/flights/JN203_2026-10-08/seats"]);
  expect(data.log.map((entry) => entry.type)).toEqual(["set", "tool-started", "tool-finished", "said", "shown"]);
});

test("saves the run as a file when Hindsight does not answer", async ({ page, context }) => {
  await context.route(`${HINDSIGHT}/open`, (route) => route.abort());
  await openPanelAfterARun(page);

  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Open in Hindsight" }).click();
  const download = await downloaded;

  expect(download.suggestedFilename()).toMatch(/^hindsight-sayso-turn-.+\.json$/);
  await expect(page.getByText("Hindsight did not answer, so the run was saved as a file.")).toBeVisible();
  const path = await download.path();
  const { readFile } = await import("node:fs/promises");
  const file = JSON.parse(await readFile(path, "utf8"));
  expect(file).toMatchObject({ format: "hindsight/run", app: "sayso", data: { words: "a window seat on my London flight" } });
});

test("has no button until a reply has been chosen to look at", async ({ page }) => {
  await openDesk(page);
  await page.getByRole("button", { name: "How it worked", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open in Hindsight" })).toHaveCount(0);
});
