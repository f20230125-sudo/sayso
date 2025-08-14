import { expect, test } from "@playwright/test";
import { cabin, checks, chooseSeat, days, flights, folded, freeSeat, openDesk, price, receipt, say } from "./helpers";

test.describe("the desk", () => {
  test("greets the traveller with their next trip and things to try", async ({ page }) => {
    await openDesk(page);
    await expect(page.getByRole("article", { name: "Dubai to Mumbai, Wed 7 Oct" })).toBeVisible();
    const tries = page.getByRole("list", { name: "Things to try" });
    await expect(tries.getByRole("button")).toHaveText([
      "Move my London flight to next week, window seat, and add a bag",
      "Check me in for Mumbai",
      "Is my flight on time?",
      "Book a flight to Paris next Friday",
      "How much have I spent this year?",
    ]);
  });

  test("answers a suggestion that is clicked", async ({ page }) => {
    await openDesk(page);
    await page.getByRole("button", { name: "Is my flight on time?" }).click();
    await expect(page.getByText("JN 303 to Mumbai is on time, and check-in is open.")).toBeVisible();
    await expect(page.getByRole("region", { name: "Status of JN 303" })).toBeVisible();
  });

  test("says so when it does not understand, and explains what it can do", async ({ page }) => {
    await openDesk(page);
    await say(page, "sing me a song");
    await expect(page.getByText(/^I did not understand that\. I can show your trips/)).toBeVisible();
    await say(page, "what can you do?");
    await expect(page.getByText(/say several at once if you like/)).toBeVisible();
  });
});

test.describe("sentences the desk will not guess at", () => {
  test("someone who says they cannot go is asked what they want, and nothing is booked", async ({ page }) => {
    await openDesk(page);
    await say(page, "I can't go to Istanbul anymore");
    await expect(page.getByText('I am not sure what you would like done about your Istanbul trip. You can say "cancel my Istanbul trip" or "move my Istanbul flight to Friday".')).toBeVisible();
    await expect(flights(page)).toHaveCount(0);
    await expect(page.getByRole("form", { name: "Flight search" })).toHaveCount(0);

    // The way it suggests then works.
    await say(page, "cancel my Istanbul trip");
    await expect(page.getByRole("region", { name: "Refund" })).toBeVisible();
  });

  test("a question about cost is answered, not turned into a request", async ({ page }) => {
    await openDesk(page);
    await say(page, "How early should I get to the airport?");
    await expect(page.getByText("Bag drop closes 1 hour before a flight leaves, boarding starts 40 minutes before, and the gate is shown 3 hours before.")).toBeVisible();
    await say(page, "do I have to pay to pick a seat");
    await expect(page.getByText(/^Choosing a seat costs AED 35 for a window or aisle seat/)).toBeVisible();
    await expect(cabin(page)).toHaveCount(0);
  });

  test("a flight is moved, not booked, when the words say a day later", async ({ page }) => {
    await openDesk(page);
    await say(page, "I need to fly a day later");
    // It is about a trip the traveller has, so it asks which one, then offers the days around it.
    await expect(page.getByText("Which trip is this for?")).toBeVisible();
    await page.getByRole("list", { name: "Your trips" }).getByRole("button", { name: /London/ }).click();
    await expect(days(page).getByRole("button", { name: /^Thu 8 Oct.*the day you fly now/ })).toBeVisible();
    await expect(page.getByRole("form", { name: "Flight search" })).toHaveCount(0);

    // With the trip named, the day is worked out and the days are skipped.
    await say(page, "never mind");
    await say(page, "move my London flight a day later");
    await expect(page.getByText("Here are the flights to London on Fri 9 Oct, with what each costs against your current fare.")).toBeVisible();
  });
});

test.describe("journeys", () => {
  test("three requests in one sentence end in one payment", async ({ page }) => {
    await openDesk(page);
    await say(page, "Move my London flight to next week, window seat, and add a bag");

    // A week of days, each with the difference from the fare already paid.
    await expect(days(page).getByRole("button")).toHaveCount(7);
    await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).click();
    await expect(folded(page, "Wed 14 Oct").first()).toBeVisible();

    await expect(flights(page).getByRole("button")).toHaveCount(3);
    await flights(page).getByRole("button", { name: /^JN 201/ }).click();

    // The cabin is the new flight's, with window seats marked.
    await expect(page.getByText("Here is the cabin on JN 201 to London. Free window seats are marked.")).toBeVisible();
    const seat = await chooseSeat(page, "window");

    // One price for all three: no stepper was shown for "a bag".
    const lines = price(page).getByRole("term");
    await expect(lines).toHaveText(["Fare difference, JN 203 to JN 201", "Change fee", `Seat ${seat}, window`, "1 extra checked bag", "To pay now"]);
    await price(page).getByRole("button", { name: /^Pay AED/ }).click();

    await expect(receipt(page).getByText("Paid")).toBeVisible();
    await expect(receipt(page).getByRole("article", { name: "Dubai to London, Wed 14 Oct" })).toContainText(`Seat ${seat}`);
    await expect(receipt(page).getByRole("article")).toContainText("2 checked bags");
    await expect(checks(page).getByRole("listitem")).toHaveCount(6);
    await expect(checks(page)).toContainText(`You asked for a window seat. ${seat} is one.`);
    await expect(checks(page).getByText("Differs:")).toHaveCount(0);

    // The account now holds the booking the order sent back.
    await say(page, "show my trips");
    await expect(page.getByRole("article", { name: "Dubai to London, Wed 14 Oct" }).last()).toContainText(`Seat ${seat}`);
  });

  test("the same journey can be done by typing alone", async ({ page }) => {
    await openDesk(page);
    await say(page, "give me a window seat");
    await expect(page.getByRole("list", { name: "Your trips" }).getByRole("button")).toHaveCount(3);
    await say(page, "the London one");
    await expect(cabin(page)).toBeVisible();
    await say(page, "you choose");
    await expect(price(page)).toContainText("AED 35");
    await say(page, "yes");
    await expect(receipt(page)).toBeVisible();
    // What was typed partway is shown where it was said.
    await expect(page.getByText("the London one")).toBeVisible();
    await expect(page.getByText("you choose")).toBeVisible();
  });

  test("a change of mind partway changes the journey in place", async ({ page }) => {
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await expect(page.getByText("Free window seats are marked.")).toBeVisible();
    await say(page, "aisle instead");
    await expect(page.getByText("Free aisle seats are marked.")).toBeVisible();
    await expect(page.getByText("Free window seats are marked.")).toHaveCount(0);
    await expect(cabin(page)).toHaveCount(1);

    // Picking something other than what was asked for is allowed, and said.
    await chooseSeat(page, "window");
    await price(page).getByRole("button", { name: /^Pay/ }).click();
    await expect(checks(page)).toContainText(/You asked for an aisle seat, and picked \d+[AF], which is a window seat\./);
  });

  test("a typed seat that is taken is explained, and the seat map keeps waiting", async ({ page }) => {
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    const taken = cabin(page).getByRole("button", { name: /, taken$/ }).first();
    const name = ((await taken.getAttribute("aria-label")) ?? "").split(",")[0];
    await say(page, name);
    await expect(page.getByText(`Seat ${name} is taken. Pick another.`)).toBeVisible();
    await expect(freeSeat(page, "window")).toBeEnabled();
  });

  test("never mind leaves a journey with nothing changed", async ({ page }) => {
    await openDesk(page);
    await say(page, "cancel my Istanbul trip");
    await expect(page.getByRole("region", { name: "Refund" })).toBeVisible();
    await say(page, "never mind");
    await expect(page.getByText("Left unfinished. Nothing was changed.")).toBeVisible();
    // The refund that was on screen folds away: it can no longer be confirmed.
    await expect(page.getByText("Not answered")).toBeVisible();
    await expect(page.getByRole("button", { name: /^Cancel booking/ })).toHaveCount(0);
    await say(page, "show my trips");
    await expect(page.getByText("You have 3 trips coming up.")).toBeVisible();
  });

  test("checks in and shows a boarding pass", async ({ page }) => {
    await openDesk(page);
    await say(page, "Check me in");
    const form = page.getByRole("region", { name: "Passenger check" });
    await expect(form).toContainText("JN 303");
    await expect(form.getByRole("button", { name: "Check in" })).toBeDisabled();
    for (const box of await form.getByRole("checkbox").all()) await box.check();
    await form.getByRole("button", { name: "Check in" }).click();

    const pass = page.getByRole("region", { name: "Boarding pass" });
    await expect(pass).toContainText("Uzair Khan");
    await expect(pass).toContainText("9C");
    await expect(checks(page)).toContainText("You are checked in for JN 303.");
    // There was nothing to pay, so no price was asked for.
    await expect(price(page)).toHaveCount(0);
  });

  test("says when check-in opens for a flight that is too far off", async ({ page }) => {
    await openDesk(page);
    await say(page, "check me in for Istanbul");
    await expect(page.getByText(/^Check-in for your flight to Istanbul on Sat 24 Oct opens on Thursday 22 October at \d\d:\d\d, 48 hours before it leaves\.$/)).toBeVisible();
  });

  test("shows a flight's status", async ({ page }) => {
    await openDesk(page);
    await say(page, "Is my flight on time?");
    await expect(page.getByText("JN 303 to Mumbai is on time, and check-in is open.")).toBeVisible();
    const status = page.getByRole("region", { name: "Status of JN 303" });
    await expect(status.getByRole("listitem")).toHaveCount(5);
    await expect(status).toContainText("Gate shown 3 hours before");
  });

  test("books a new flight from a form, then a seat on it", async ({ page }) => {
    await openDesk(page);
    await say(page, "book a flight with an aisle seat");
    const search = page.getByRole("form", { name: "Flight search" });
    await search.getByLabel("To", { exact: true }).selectOption("SIN");
    await search.getByLabel("On", { exact: true }).fill("2026-11-02");
    await search.getByRole("button", { name: "Find flights" }).click();

    await expect(page.getByText("Here are the flights to Singapore on Mon 2 Nov.")).toBeVisible();
    await flights(page).getByRole("button").first().click();
    const seat = await chooseSeat(page, "aisle");
    await price(page).getByRole("button", { name: /^Pay/ }).click();

    await expect(page.getByText("You are booked.")).toBeVisible();
    await expect(receipt(page).getByRole("article", { name: "Dubai to Singapore, Mon 2 Nov" })).toContainText(`Seat ${seat}`);
    await say(page, "show my trips");
    await expect(page.getByText("You have 4 trips coming up.")).toBeVisible();
  });

  test("cancels a booking and refunds it", async ({ page }) => {
    await openDesk(page);
    await say(page, "cancel my Istanbul trip");
    const refund = page.getByRole("region", { name: "Refund" });
    await expect(refund).toContainText("Cancellation fee");
    await refund.getByRole("button", { name: /^Cancel booking, refund AED/ }).click();
    await expect(page.getByText("Your booking is cancelled.")).toBeVisible();
    await expect(receipt(page)).toContainText("Refunded");
    await expect(checks(page)).toContainText("Booking R3XD8N is cancelled.");
  });

  test("asks how many bags when the words did not say", async ({ page }) => {
    await openDesk(page);
    await say(page, "I need more bags for Istanbul");
    const bags = page.getByRole("region", { name: "Checked bags" });
    await bags.getByRole("button", { name: "One bag more" }).click();
    await bags.getByRole("button", { name: "Add 2 bags" }).click();
    await expect(price(page)).toContainText("2 extra checked bags");
    await expect(price(page)).toContainText("AED 240");
  });
});

test.describe("questions about your own account", () => {
  test("are answered with figures and a chart worked out from the account", async ({ page }) => {
    await openDesk(page);
    await say(page, "How much have I spent this year?");
    await expect(page.getByText(/^You have spent AED [\d,]+ on flights so far this year\.$/)).toBeVisible();

    const card = page.getByRole("region", { name: "What you have spent this year" });
    await expect(card.getByRole("term")).toHaveText(["Spent this year", "Payments", "Largest"]);
    // One column a month, January to October, each readable without seeing the chart.
    const columns = card.getByRole("list", { name: "Spending by month" }).getByRole("listitem");
    await expect(columns).toHaveCount(10);
    await expect(columns.last()).toContainText(/^Oct: AED [\d,]+/);

    // The value of a column shows when it is pointed at or focused.
    await columns.nth(8).focus();
    await expect(columns.nth(8).getByText(/^Sep: /).last()).toBeVisible();

    // Paying for something changes the answer, because it is worked out afresh.
    const before = await card.getByRole("definition").first().innerText();
    await say(page, "add two bags to my Istanbul flight");
    await price(page).getByRole("button", { name: /^Pay/ }).click();
    await expect(receipt(page)).toBeVisible();
    await say(page, "how much have I spent this year?");
    const after = page.getByRole("region", { name: "What you have spent this year" }).last().getByRole("definition").first();
    await expect(after).not.toHaveText(before);
  });

  test("come as a table for payments, and a bar per route", async ({ page }) => {
    await openDesk(page);
    await say(page, "show my recent payments");
    await expect(page.getByRole("table", { name: "Your latest payments" }).getByRole("row")).toHaveCount(9);
    await say(page, "show my spending by route");
    await expect(page.getByRole("list", { name: "Spending by route" }).getByRole("listitem").first()).toContainText("Dubai to");
  });
});

test.describe("staying where you were", () => {
  test("a reload in the middle of a journey loses nothing", async ({ page }) => {
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await expect(cabin(page)).toBeVisible();
    // Give the save a moment: it waits for changes to settle.
    await page.waitForTimeout(600);

    await page.reload();
    await expect(page.getByText("a window seat on my London flight")).toBeVisible();
    await expect(cabin(page)).toBeVisible();

    // And the journey carries on from there.
    const seat = await chooseSeat(page, "window");
    await price(page).getByRole("button", { name: /^Pay/ }).click();
    await expect(receipt(page)).toContainText(`Seat ${seat}`);
  });

  test("starting over brings back the demo trips and an empty desk", async ({ page }) => {
    await openDesk(page);
    await say(page, "cancel my Istanbul trip");
    await page.getByRole("button", { name: /^Cancel booking/ }).click();
    await expect(receipt(page)).toBeVisible();

    await page.getByRole("button", { name: "Start over with fresh demo trips" }).click();
    await expect(page.getByRole("heading", { name: "Hello, Uzair." })).toBeVisible();
    await say(page, "show my trips");
    await expect(page.getByText("You have 3 trips coming up.")).toBeVisible();
  });

  test("the theme is remembered", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await openDesk(page);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  });
});

test.describe("when the airline does not answer", () => {
  test("a failed call is shown with a way to try again", async ({ page }) => {
    let fail = true;
    await page.route("**/api/quotes", (route) => (fail ? route.fulfill({ status: 500, json: {} }) : route.continue()));
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await chooseSeat(page, "window");

    // Next.js keeps an empty alert of its own on the page, for announcing navigation.
    const alert = page.getByRole("alert").filter({ hasText: "The airline answered 500. Try again in a moment." });
    await expect(alert).toBeVisible();
    fail = false;
    await alert.getByRole("button", { name: "Try again" }).click();
    await expect(price(page)).toBeVisible();
    await expect(alert).toHaveCount(0);
  });

  test("a call under way can be stopped", async ({ page }) => {
    await page.route("**/api/flights/*/seats", () => {
      // Never answered: the call stays under way until it is stopped.
    });
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await expect(page.getByRole("status").filter({ hasText: "Get the seat map" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();
    await expect(page.getByText("Stopped. Nothing was changed.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });
});

test.describe("without a mouse", () => {
  test("the seat map works with the keyboard alone", async ({ page }) => {
    await openDesk(page);
    await say(page, "a window seat on my London flight");
    await expect(cabin(page)).toBeVisible();

    // One seat takes the Tab key: the first free window seat.
    const first = freeSeat(page, "window");
    await first.focus();
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(cabin(page).locator('button[tabindex="0"]')).toHaveCount(1);

    // The arrow keys move between seats, and the focus follows.
    await page.keyboard.press("ArrowDown");
    await expect(cabin(page).locator('button[tabindex="0"]')).toBeFocused();
    await expect(cabin(page).locator('button[tabindex="0"]')).not.toHaveAttribute("aria-label", (await first.getAttribute("aria-label")) ?? "");
    await page.keyboard.press("ArrowUp");
    await expect(first).toBeFocused();

    await page.keyboard.press("Enter");
    await expect(first).toHaveAttribute("aria-pressed", "true");
    const name = ((await first.getAttribute("aria-label")) ?? "").split(",")[0];
    await page.getByRole("button", { name: `Choose ${name}` }).press("Enter");
    await expect(price(page)).toContainText(`Seat ${name}`);
  });
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("a journey fits the screen without scrolling sideways", async ({ page }) => {
    await openDesk(page);
    await say(page, "Move my London flight to next week, window seat, and add a bag");
    await days(page).getByRole("button", { name: /^Wed 14 Oct/ }).click();
    await flights(page).getByRole("button").first().click();
    await chooseSeat(page, "window");
    await expect(price(page)).toBeVisible();
    const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(sideways).toBe(0);
  });
});
