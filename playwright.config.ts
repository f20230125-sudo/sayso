import { defineConfig, devices } from "@playwright/test";

// End-to-end tests drive the real app in a real browser. Locally they use the
// dev server (and reuse one that is already running); in CI they run against
// the production build.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3030",
    trace: "retain-on-failure",
    // The demo trips are dated from "today" on the visitor's own clock, and
    // check-in opens by the hour. One fixed zone keeps a test the same on a
    // laptop in Dubai and on a CI machine in UTC.
    timezoneId: "Asia/Dubai",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 900 } },
    },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    url: "http://localhost:3030",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The tests fix the browser's clock (see tests/e2e/helpers.ts). The server's must agree.
    env: { SAYSO_NOW: "2026-10-06T10:30:00+04:00" },
  },
});
