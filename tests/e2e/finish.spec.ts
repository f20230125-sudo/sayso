import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cabin, chooseSeat, days, flights, openDesk, price, receipt, say } from "./helpers";

// What a visitor meets before and around the journeys: the first screen on a
// phone and in a small window, sideways scrolling, the size of what can be
// touched, where the keyboard goes, and what a link preview shows.

/** How far the page, the scrolling area and anything inside it reach past the right edge of the screen. Zero is right. */
async function sideways(page: Page): Promise<{ page: number; main: number; strays: string[] }> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const main = document.querySelector("main");
    const width = window.innerWidth;
    const strays: string[] = [];
    // Anything that sticks out, unless it sits inside a box that scrolls on purpose.
    for (const element of document.querySelectorAll("main *, aside *, dialog *, header *")) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 || box.right <= width + 1) continue;
      let scrolls = false;
      for (let up = element.parentElement; up && up !== main; up = up.parentElement) {
        const overflow = getComputedStyle(up).overflowX;
        if (overflow === "auto" || overflow === "scroll" || overflow === "hidden") scrolls = true;
      }
      if (!scrolls) strays.push(`${element.tagName.toLowerCase()}.${String(element.getAttribute("class") ?? "").slice(0, 60)}`);
    }
    return { page: root.scrollWidth - root.clientWidth, main: main ? main.scrollWidth - main.clientWidth : 0, strays: strays.slice(0, 5) };
  });
}

async function expectNoSideways(page: Page) {
  expect(await sideways(page)).toEqual({ page: 0, main: 0, strays: [] });
}

/** Everything on screen a finger could land on, with the size it has. */
async function targets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("button, a[href], select, input, summary")]
      .filter((element) => {
        const box = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && !element.closest("[hidden]") && !(element.className + "").includes("skip-link");
      })
      .map((element) => {
        const box = element.getBoundingClientRect();
        return { name: (element.getAttribute("aria-label") ?? element.textContent ?? "").trim().slice(0, 40), width: Math.round(box.width), height: Math.round(box.height) };
      }),
  );
}

const focusedTag = (page: Page) => page.evaluate(() => document.activeElement?.tagName ?? "none");

test.describe("the first screen", () => {
  test("on a phone shows the pass, the sentences and the made-up disclosure without scrolling", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDesk(page);
    const view = page.viewportSize()!;
    const bar = await page.getByLabel("Say what you need").boundingBox();
    const pass = await page.getByRole("article").boundingBox();
    const first = await page.getByRole("list", { name: "Things to try" }).getByRole("button").first().boundingBox();
    const note = await page.getByText(/^A demo\. Juno Air is made up and nothing here is really booked or charged\.$/).boundingBox();
    expect(pass && pass.y + pass.height).toBeLessThan(view.height);
    // The first sentence is whole, above the ask bar.
    expect(first && first.y + first.height).toBeLessThanOrEqual(bar!.y);
    expect(note && note.y + note.height).toBeLessThanOrEqual(view.height);
    await expectNoSideways(page);
  });

  test("in a small window, such as one in Portfolio OS, shows the pass and the sentences side by side", async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 640 });
    await openDesk(page);
    const pass = await page.getByRole("article").boundingBox();
    const first = await page.getByRole("list", { name: "Things to try" }).getByRole("button").first().boundingBox();
    const bar = await page.getByLabel("Say what you need").boundingBox();
    expect(pass && pass.y + pass.height).toBeLessThan(bar!.y);
    expect(first && first.y + first.height).toBeLessThanOrEqual(bar!.y);
    expect(pass!.x).toBeGreaterThan(first!.x + first!.width / 2);
    await expectNoSideways(page);
  });

  test("says under each sentence what it builds", async ({ page }) => {
    await openDesk(page);
    const tries = page.getByRole("list", { name: "Things to try" });
    // Computed from the real plan, so these are the components a journey shows, in order.
    await expect(tries.getByRole("button", { name: "Move my London flight to next week, window seat, and add a bag" })).toHaveAccessibleDescription(
      "Days, flights, seat map, price summary, receipt",
    );
    await expect(tries.getByRole("button", { name: "Check me in for Mumbai" })).toHaveAccessibleDescription("Passenger check, boarding pass");
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no journey, and not the gallery, scrolls sideways", async ({ page }) => {
    test.slow();
    await openDesk(page);

    // Three requests in one sentence, down to the receipt.
    await say(page, "Move my London flight to next week, window seat, and add a bag");
    await expect(days(page)).toBeVisible();
    await expectNoSideways(page);
    await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).click();
    await expect(flights(page)).toBeVisible();
    await expectNoSideways(page);
    await flights(page).getByRole("button").first().click();
    await expect(cabin(page)).toBeVisible();
    await expectNoSideways(page);
    await chooseSeat(page, "window");
    await expect(price(page)).toBeVisible();
    await expectNoSideways(page);
    await price(page).getByRole("button", { name: /^Pay/ }).click();
    await expect(receipt(page)).toBeVisible();
    await expectNoSideways(page);

    // The carbon copy covers the page, with a call opened inside it.
    await page.getByRole("button", { name: "How it worked", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "How it worked" });
    await panel.getByRole("button", { name: "Open came back" }).first().click();
    await expectNoSideways(page);
    await panel.getByRole("button", { name: "Close how it worked" }).click();

    for (const [words, shown] of [
      ["Check me in", page.getByRole("region", { name: "Passenger check" })],
      ["Is my flight on time?", page.getByRole("region", { name: /^Status of/ })],
      ["Cancel my Istanbul trip", page.getByRole("region", { name: "Refund" })],
      ["Book a flight", page.getByRole("form", { name: "Flight search" })],
      ["I need more bags for Istanbul", page.getByRole("region", { name: "Checked bags" })],
      ["How much have I spent this year?", page.getByRole("list", { name: "Spending by month" })],
      ["show my recent payments", page.getByRole("table", { name: "Your latest payments" })],
    ] as const) {
      // Anything still waiting would take the words as its answer.
      await say(page, "never mind");
      await say(page, words);
      await expect(shown).toBeVisible();
      await expectNoSideways(page);
    }

    await page.goto("/gallery");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("14 pieces");
    await expectNoSideways(page);
    for (const summary of await page.getByText("Schema", { exact: true }).all()) await summary.click();
    await expectNoSideways(page);
  });

  test("everything that can be touched is at least 24 px, and the main buttons 44", async ({ page }) => {
    await openDesk(page);
    for (const target of await targets(page)) {
      expect(target.width, target.name).toBeGreaterThanOrEqual(24);
      expect(target.height, target.name).toBeGreaterThanOrEqual(24);
    }
    expect((await page.getByRole("button", { name: "Send" }).boundingBox())!.height).toBeGreaterThanOrEqual(44);

    await say(page, "a window seat on my London flight");
    await expect(cabin(page)).toBeVisible();
    for (const target of await targets(page)) {
      expect(target.width, target.name).toBeGreaterThanOrEqual(24);
      expect(target.height, target.name).toBeGreaterThanOrEqual(24);
    }
    await chooseSeat(page, "window");
    expect((await price(page).getByRole("button", { name: /^Pay/ }).boundingBox())!.height).toBeGreaterThanOrEqual(44);
  });

  test("the gallery, with every schema open, has nothing under 24 px", async ({ page }) => {
    await page.goto("/gallery");
    for (const summary of await page.getByText("Schema", { exact: true }).all()) await summary.click();
    const small = (await targets(page)).filter((target) => target.width < 24 || target.height < 24);
    expect(small).toEqual([]);
  });
});

test.describe("with the keyboard", () => {
  test("a skip link is the first stop, and takes you to the content", async ({ page }) => {
    await openDesk(page);
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: "Skip to the content" });
    await expect(skip).toBeFocused();
    await expect(skip).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("main")).toBeFocused();
  });

  test("the focus goes on to the next form after each choice, and never to the page itself", async ({ page }) => {
    await openDesk(page);
    await say(page, "Move my London flight to next week, window seat, and add a bag");
    await expect(days(page)).toBeVisible();

    // A day, chosen with the keyboard: the folded line takes the focus, then the flights.
    await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).focus();
    await page.keyboard.press("Enter");
    await expect(flights(page)).toBeVisible();
    await expect(flights(page).getByRole("button").first()).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(cabin(page)).toBeVisible();
    await expect(cabin(page).locator('button[tabindex="0"]')).toBeFocused();

    // An answer that is not yet given leaves the button focusable, and it is marked as unavailable, not disabled.
    const choose = page.getByRole("button", { name: "Choose seat" });
    await expect(choose).toHaveAttribute("aria-disabled", "true");
    await expect(choose).not.toHaveAttribute("disabled", /.*/);
    await choose.focus();
    await expect(choose).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(choose).toBeVisible();

    await cabin(page).getByRole("button", { name: /window, free/ }).first().focus();
    await page.keyboard.press("Enter");
    await page.keyboard.press("Tab");
    // The focus ring shows on a button filled with the highlighter.
    const ring = await page.evaluate(() => {
      const style = getComputedStyle(document.activeElement!);
      return { style: style.outlineStyle, width: style.outlineWidth, label: document.activeElement?.textContent };
    });
    expect(ring.label).toMatch(/^Choose \d/);
    expect(ring.style).toBe("solid");
    expect(ring.width).toBe("2px");
    await page.keyboard.press("Enter");
    await expect(price(page)).toBeVisible();
    await expect(price(page).getByRole("button", { name: /^Pay/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(receipt(page)).toBeVisible();
    expect(await focusedTag(page)).not.toBe("BODY");
  });

  test("a sentence chosen from the list leaves the focus on its first form", async ({ page }) => {
    await openDesk(page);
    await page.getByRole("button", { name: "Move my London flight to next week, window seat, and add a bag" }).click();
    await expect(days(page)).toBeVisible();
    expect(await focusedTag(page)).not.toBe("BODY");
    await expect(days(page).getByRole("button").first()).toBeFocused();
  });

  test("typing an answer does not take the focus out of the ask bar", async ({ page }) => {
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await expect(cabin(page)).toBeVisible();
    await say(page, "the earliest window seat");
    await expect(page.getByLabel("Say what you need")).toBeFocused();
  });

  test("the panel takes the focus when it opens, and gives it back when it closes", async ({ page }) => {
    await openDesk(page);
    await say(page, "show my trips");
    await page.getByRole("button", { name: "How it worked", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "How it worked" });
    await expect(panel.getByRole("heading", { name: "How it worked", level: 2 })).toBeFocused();
    await panel.getByRole("button", { name: "Close how it worked" }).click();
    await expect(panel).toHaveCount(0);
    await expect(page.getByRole("button", { name: "How it worked", exact: true })).toBeFocused();
  });

  test("after a failed call, trying again does not drop the focus", async ({ page }) => {
    let fail = true;
    await page.route("**/api/quotes", (route) => (fail ? route.fulfill({ status: 500, json: {} }) : route.continue()));
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await chooseSeat(page, "window");
    const alert = page.getByRole("alert").filter({ hasText: "The airline answered 500. Try again in a moment." });
    await expect(alert).toBeVisible();
    fail = false;
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(price(page)).toBeVisible();
    expect(await focusedTag(page)).not.toBe("BODY");
  });

  test("every control shows a focus ring when the keyboard is on it", async ({ page }) => {
    await openDesk(page);
    const without: string[] = [];
    for (let stop = 0; stop < 14; stop += 1) {
      await page.keyboard.press("Tab");
      const state = await page.evaluate(() => {
        const element = document.activeElement as HTMLElement;
        // The ask bar's input shows its focus on the bar around it, and a sentence on its whole row.
        const shown = element.matches("[data-ask-input]") ? element.closest("form")! : (element.closest("ul[aria-label='Things to try'] li") ?? element);
        const style = getComputedStyle(shown);
        return { name: element.getAttribute("aria-label") ?? element.textContent?.slice(0, 30) ?? "", ring: style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2 };
      });
      if (!state.ring) without.push(state.name);
    }
    expect(without).toEqual([]);
  });
});

test.describe("what a link preview shows", () => {
  for (const [path, title, description] of [
    ["/", "Sayso: say what you need, and the screen builds itself", "A service desk for a made-up airline"],
    ["/gallery", "Components · Sayso", "Every component the desk can build a reply from"],
  ] as const) {
    test(`${path} has its own title and description, an icon and a picture`, async ({ page, request }) => {
      await page.goto(path);
      await expect(page).toHaveTitle(title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", new RegExp(`^${description}`));
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute("content", title);
      await expect(page.locator('meta[property="og:description"]')).toHaveAttribute("content", new RegExp(`^${description}`));
      for (const selector of ['meta[property="og:image"]', 'link[rel="icon"]']) {
        const address = (await page.locator(selector).first().getAttribute(selector.startsWith("meta") ? "content" : "href"))!;
        const response = await request.get(new URL(address, page.url()).pathname);
        expect(response.ok(), address).toBe(true);
      }
    });
  }
});

test.describe("motion", () => {
  test("the highlighter wipes in for an answer given now, and not for a saved conversation", async ({ page }) => {
    await openDesk(page);
    await say(page, "Move my London flight to next week, window seat, and add a bag");
    await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).click();
    const answer = page.locator(".stroke").filter({ hasText: "Wed 14 Oct" });
    await expect(answer).toHaveClass(/stroke-play/);
    await expect(answer).toHaveCSS("animation-name", "stroke-wipe");
    await expect(flights(page)).toBeVisible();

    // Loaded again from the browser's memory, the same line is already marked and nothing plays.
    await page.waitForTimeout(600);
    await page.reload();
    const again = page.locator(".stroke").filter({ hasText: "Wed 14 Oct" });
    await expect(again).toBeVisible();
    await expect(again).not.toHaveClass(/stroke-play/);
  });

  test("for anyone who asks for less motion, the stroke is full at once and the working rule is still", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/flights/*/seats", () => {
      // Never answered, so the desk stays at work.
    });
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await expect(page.getByRole("status").filter({ hasText: "Get the seat map" }).locator(".working-rule")).toHaveCSS("animation-name", "none");
    await page.getByRole("button", { name: "Stop" }).click();
    await say(page, "Move my London flight to next week, window seat, and add a bag");
    await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).click();
    await expect(page.locator(".stroke-play")).toHaveCSS("animation-name", "none");
  });
});

test.describe("a page that is not there", () => {
  for (const theme of ["light", "dark"] as const) {
    test.describe(`in the ${theme} theme`, () => {
      test.use({ colorScheme: theme });

      test("says so plainly, offers the way back, and passes the accessibility scan", async ({ page }) => {
        const response = await page.goto("/there-is-nothing-here");
        expect(response?.status()).toBe(404);
        await expect(page.getByRole("heading", { level: 1 })).toHaveText("There is no page at this address");
        const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
        expect(results.violations.map((violation) => violation.id)).toEqual([]);
        await page.getByRole("link", { name: "Go to the desk" }).click();
        await expect(page.getByRole("heading", { name: "Hello, Uzair." })).toBeVisible();
      });
    });
  }
});

test.describe("the pass on the first screen", () => {
  for (const [width, height, panel] of [
    [1440, 900, false],
    [1440, 900, true],
    [1200, 700, false],
    [1024, 700, false],
    [800, 640, false],
    [390, 844, false],
  ] as const) {
    test(`keeps its codes and the flying time apart at ${width} px${panel ? " with How it worked open" : ""}`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await openDesk(page);
      if (panel) await page.getByRole("button", { name: "How it worked", exact: true }).click();
      const pass = page.getByRole("article");
      const from = await pass.getByText("DXB", { exact: true }).boundingBox();
      const time = await pass.getByText("3h 15m", { exact: true }).boundingBox();
      const to = await pass.getByText("BOM", { exact: true }).boundingBox();
      const frame = await pass.boundingBox();
      expect(from!.x + from!.width).toBeLessThanOrEqual(time!.x);
      expect(time!.x + time!.width).toBeLessThanOrEqual(to!.x);
      expect(to!.x + to!.width).toBeLessThanOrEqual(frame!.x + frame!.width);
      await expectNoSideways(page);
    });
  }
});
