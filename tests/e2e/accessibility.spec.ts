import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { cabin, chooseSeat, days, flights, openDesk, price, receipt, say } from "./helpers";

// An automated scan for the accessibility problems a machine can find:
// missing labels, poor contrast, wrong roles. It runs in both themes, because
// contrast is a property of the colours.

async function violations(page: Page) {
  // Let anything that is still arriving settle: a component mid-fade has
  // see-through text, which is not what a visitor is left looking at.
  await page.waitForTimeout(500);
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return results.violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    where: violation.nodes.slice(0, 3).map((node) => node.target.join(" ")),
    help: violation.help,
  }));
}

for (const theme of ["light", "dark"] as const) {
  test.describe(`accessibility, ${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test("the welcome page", async ({ page }) => {
      await openDesk(page);
      expect(await violations(page)).toEqual([]);
    });

    test("every component, in the gallery", async ({ page }) => {
      // The longest page in the app, with every schema opened: the scan takes a while.
      test.slow();
      await page.goto("/gallery");
      await expect(page.getByRole("heading", { level: 1 })).toContainText("13 pieces");
      await expect(page.getByRole("grid")).toBeVisible();
      for (const summary of await page.getByText("Schema", { exact: true }).all()) await summary.click();
      expect(await violations(page)).toEqual([]);
    });

    test("a journey under way, at each component", async ({ page }) => {
      await openDesk(page);
      await say(page, "Move my London flight to next week, window seat, and add a bag");
      await expect(days(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).click();
      await expect(flights(page)).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await flights(page).getByRole("button").first().click();
      await expect(cabin(page)).toBeVisible();
      await cabin(page).getByRole("button", { name: /window, free/ }).first().click();
      expect(await violations(page)).toEqual([]);
    });

    test("a finished journey, with how it worked open", async ({ page }) => {
      await openDesk(page);
      await say(page, "a window seat on my London flight");
      await chooseSeat(page, "aisle");
      await price(page).getByRole("button", { name: /^Pay/ }).click();
      await expect(receipt(page)).toBeVisible();
      await page.getByRole("button", { name: /How it worked$/ }).last().click();
      const panel = page.getByRole("complementary", { name: "How it worked" });
      await panel.getByRole("button", { name: "Open came back" }).first().click();
      await expect(panel.getByText("flightId")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the other journeys' components in place", async ({ page }) => {
      await openDesk(page);
      await say(page, "Check me in");
      await expect(page.getByRole("region", { name: "Passenger check" })).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await say(page, "is my flight on time?");
      await expect(page.getByRole("region", { name: /^Status of/ })).toBeVisible();
      await say(page, "cancel my Istanbul trip");
      await expect(page.getByRole("region", { name: "Refund" })).toBeVisible();
      expect(await violations(page)).toEqual([]);

      await say(page, "book a flight");
      await expect(page.getByRole("form", { name: "Flight search" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("a failed call", async ({ page }) => {
      await page.route("**/api/flights/*/seats", (route) => route.fulfill({ status: 500, json: {} }));
      await openDesk(page);
      await say(page, "a window seat on my London flight");
      await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });

    test("the model settings, and an answer written by a model", async ({ page }) => {
      await page.route("https://generativelanguage.googleapis.com/**", async (route) => {
        const body = route.request().postDataJSON() as { stream?: boolean } | null;
        if (body?.stream) {
          const line = `data: ${JSON.stringify({ choices: [{ delta: { content: "A checked bag costs AED 120." } }] })}\n\ndata: [DONE]\n\n`;
          await route.fulfill({ status: 200, contentType: "text/event-stream", body: line });
        } else {
          await route.fulfill({ status: 200, json: { choices: [{ message: { content: '{"kind":"talk"}' } }] } });
        }
      });
      await openDesk(page);
      await page.getByRole("button", { name: "Language model: none, built-in rules only" }).click();
      const dialog = page.getByRole("dialog", { name: "Language model" });
      await dialog.getByLabel("Provider").selectOption("gemini");
      await dialog.getByLabel("API key").fill("test-key");
      expect(await violations(page)).toEqual([]);

      await dialog.getByRole("button", { name: "Save" }).click();
      await say(page, "am I allowed to bring my cello?");
      await expect(page.getByText("A checked bag costs AED 120.")).toBeVisible();
      expect(await violations(page)).toEqual([]);
    });
  });
}

test.describe("how it worked", () => {
  test("shows the four steps of a reply, with the real calls", async ({ page }) => {
    await openDesk(page);
    await page.getByRole("button", { name: "How it worked", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "How it worked" });
    await expect(panel).toContainText("Ask for something, and this panel shows the four steps behind the reply");

    await say(page, "a window seat on my London flight");
    await expect(cabin(page)).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3 })).toHaveText([/^1Understand(under 1|\d+) ms$/, "2Plan10 steps", /^3Run1 call, /, "4Check"]);
    await expect(panel).toContainText("Read by the built-in rules. No model was asked.");
    await expect(panel).toContainText("Choose a seat");
    await expect(panel).toContainText("seat wantedwindow");
    await expect(panel.getByText("(now)")).toHaveCount(1);
    await expect(panel).toContainText("/api/flights/JN203_2026-10-08/seats");
    await expect(panel).toContainText("The checks run once the journey is finished.");

    // The data shown is the data that came back.
    await panel.getByRole("button", { name: "Open came back" }).click();
    await expect(panel).toContainText('flightId: "JN203_2026-10-08"');

    const seat = await chooseSeat(page, "window");
    await price(page).getByRole("button", { name: /^Pay/ }).click();
    await expect(receipt(page)).toBeVisible();
    await expect(panel.getByRole("heading", { level: 3 }).nth(2)).toContainText("3 calls");
    await expect(panel).toContainText(`You asked for a window seat. ${seat} is one.`);
    await expect(panel.getByText("(now)")).toHaveCount(0);

    await panel.getByRole("button", { name: "Close how it worked" }).click();
    await expect(panel).toHaveCount(0);
  });

  test("opens on the turn it was asked about, and follows the next thing asked", async ({ page }) => {
    await openDesk(page);
    await say(page, "show my trips");
    await say(page, "is my flight on time?");
    await page.getByRole("region", { name: "You said: show my trips" }).getByRole("button", { name: /How it worked$/ }).click();
    const panel = page.getByRole("complementary", { name: "How it worked" });
    await expect(panel).toContainText("“show my trips”");
    await say(page, "hello");
    await expect(panel).toContainText("“hello”");
    await expect(panel).toContainText("Small talk.");
  });

  test("covers the page on a phone, and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openDesk(page);
    await say(page, "show my trips");
    await page.getByRole("button", { name: "How it worked", exact: true }).click();
    const panel = page.getByRole("complementary", { name: "How it worked" });
    const box = await panel.boundingBox();
    expect(box?.width).toBe(390);
    await panel.getByRole("button", { name: "Close how it worked" }).click();
    await expect(page.getByLabel("Say what you need")).toBeVisible();
  });
});

test.describe("the gallery and the catalogue", () => {
  test("shows every component, and each can be tried", async ({ page }) => {
    await page.goto("/gallery");
    await expect(page.getByRole("navigation", { name: "Components" }).getByRole("link")).toHaveCount(13);
    await page.getByRole("region", { name: "Seat map" }).getByRole("button", { name: /window, free/ }).first().click();
    await page.getByRole("region", { name: "Seat map" }).getByRole("button", { name: /^Choose \d/ }).click();
    await expect(page.getByText("In a conversation, that answer would carry the journey on.")).toBeVisible();
    await page.getByRole("link", { name: "Back to the desk" }).click();
    await expect(page.getByLabel("Say what you need")).toBeVisible();
  });

  test("the catalogue route lists journeys, components and calls with their schemas", async ({ request }) => {
    const response = await request.get("/api/catalog");
    expect(response.ok()).toBe(true);
    const body = (await response.json()) as { journeys: unknown[]; widgets: { type: string; props: { type: string } }[]; tools: { name: string }[] };
    expect(body.journeys).toHaveLength(8);
    expect(body.widgets).toHaveLength(13);
    expect(body.widgets.every((widget) => widget.props.type === "object")).toBe(true);
    expect(body.tools.map((tool) => tool.name).sort()).toEqual(["calendar", "order", "quote", "searchFlights", "seatMap", "status"]);
  });
});
