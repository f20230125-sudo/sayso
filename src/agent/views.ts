import { upcoming } from "@/airline/account";
import { MONTHS, partsOf, shortDay, type IsoDate } from "@/airline/dates";
import type { Account, Payment } from "@/airline/schema";
import { money, type Block } from "@/widgets/specs";
import type { ViewName } from "./types";

// Ready-made views of the traveller's own account.
//
// "How much have I spent on flights this year?" is not one of the desk's
// journeys, and there is no screen designed for it. Whoever understands the
// question (the rules, or a model) only picks which of these views answer it.
// Each view is worked out here, in code, from the account: the sums, the
// months, the order. So the layout of an answer can vary with the question,
// and no number in it can be made up.

export const VIEW_TITLES: Record<ViewName, string> = {
  spending: "What you have spent this year",
  "spending-by-month": "Spending by month",
  "spending-by-route": "Spending by route",
  payments: "Your latest payments",
  upcoming: "Your upcoming trips",
};

/** What a model is told each view holds. */
export const VIEW_NOTES: Record<ViewName, string> = {
  spending: "the total spent on flights this year, how many payments, and the largest one",
  "spending-by-month": "the amount spent in each month of this year",
  "spending-by-route": "the amount spent on each route this year, largest first",
  payments: "the latest payments and refunds, one row each",
  upcoming: "the upcoming trips as a table",
};

function signed(amount: number): string {
  return `${amount < 0 ? "− " : ""}${money(amount)}`;
}

/** This year's payments, up to today. Refunds are in there too, as negative amounts. */
function thisYear(account: Account, today: IsoDate): Payment[] {
  const { year } = partsOf(today);
  return account.payments.filter((payment) => payment.date >= `${year}-01-01` && payment.date <= today);
}

/** One view as a block for the answer card, or null when there is nothing in it to show. */
export function viewBlock(view: ViewName, account: Account, today: IsoDate): Block | null {
  const payments = thisYear(account, today);

  switch (view) {
    case "spending": {
      const paid = payments.filter((payment) => payment.amount > 0);
      const largest = [...paid].sort((a, b) => b.amount - a.amount)[0];
      return {
        kind: "figures",
        figures: [
          { label: "Spent this year", value: signed(payments.reduce((sum, payment) => sum + payment.amount, 0)) },
          { label: "Payments", value: String(paid.length) },
          ...(largest ? [{ label: "Largest", value: money(largest.amount), note: largest.route }] : []),
        ],
      };
    }
    case "spending-by-month": {
      const { month: thisMonth } = partsOf(today);
      const rows = Array.from({ length: thisMonth }, (_unused, index) => {
        const value = payments.filter((payment) => partsOf(payment.date).month === index + 1).reduce((sum, payment) => sum + payment.amount, 0);
        return { label: MONTHS[index].slice(0, 3), value, text: signed(value) };
      });
      return rows.some((row) => row.value !== 0) ? { kind: "columns", title: VIEW_TITLES[view], rows } : null;
    }
    case "spending-by-route": {
      const totals = new Map<string, number>();
      for (const payment of payments) totals.set(payment.route, (totals.get(payment.route) ?? 0) + payment.amount);
      const rows = [...totals]
        .map(([label, value]) => ({ label, value, text: signed(value) }))
        .filter((row) => row.value > 0)
        .sort((a, b) => b.value - a.value)
        .slice(0, 6);
      return rows.length > 0 ? { kind: "bars", title: VIEW_TITLES[view], rows } : null;
    }
    case "payments": {
      const { year } = partsOf(today);
      // A payment from another year says which, or "30 Dec" would read as this year's.
      const dated = (date: IsoDate) => (partsOf(date).year === year ? shortDay(date) : `${shortDay(date)} ${partsOf(date).year}`);
      const rows = [...account.payments]
        .filter((payment) => payment.date <= today)
        .sort((a, b) => (a.date < b.date ? 1 : -1))
        .slice(0, 8)
        .map((payment) => [dated(payment.date), payment.what, payment.route, signed(payment.amount)]);
      return rows.length > 0 ? { kind: "table", title: VIEW_TITLES[view], columns: ["Date", "For", "Route", "Amount"], rows } : null;
    }
    case "upcoming": {
      const rows = upcoming(account, today).map((booking) => [
        booking.flight.number,
        `${booking.flight.fromCity} to ${booking.flight.toCity}`,
        `${shortDay(booking.flight.date)}, ${booking.flight.departs}`,
        booking.seat ?? "None",
        String(booking.bags),
      ]);
      return rows.length > 0 ? { kind: "table", title: VIEW_TITLES[view], columns: ["Flight", "Route", "Leaves", "Seat", "Bags"], rows } : null;
    }
  }
}

/** The line said above an answer, taken from the first view in it. */
export function leadFor(view: ViewName, account: Account, today: IsoDate): string {
  const payments = thisYear(account, today);
  switch (view) {
    case "spending":
    case "spending-by-month":
      return `You have spent ${signed(payments.reduce((sum, payment) => sum + payment.amount, 0))} on flights so far this year.`;
    case "spending-by-route":
      return "Here is what each route has cost you this year.";
    case "payments":
      return "Here are your latest payments.";
    case "upcoming":
      return "Here are your trips, side by side.";
  }
}
