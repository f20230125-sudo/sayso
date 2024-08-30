// Where the keyboard focus goes when the thing that had it leaves the page.
//
// Answering a component folds it to a line, and the next component arrives a
// moment later. Without help the focus would drop to the page itself and a
// keyboard user would start again from the top. So the folded line takes the
// focus, and the next component takes it from there.

/** How long after an answer the next component may still take the focus. */
const HAND_OFF_MS = 10_000;

let askedAt: number | null = null;

/** The focus was on something that is about to leave: the next component should have it. */
export function requestHandOff(): void {
  askedAt = performance.now();
}

/** True once per request, and only while it is recent. */
export function takeHandOff(): boolean {
  const recent = askedAt !== null && performance.now() - askedAt < HAND_OFF_MS;
  askedAt = null;
  return recent;
}

export function askInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>("[data-ask-input]");
}

/**
 * Whether the focus is nowhere in particular: the page, a folded line, a form
 * that has been answered and is closing, or an ask bar nobody is typing in.
 * `next` is the form about to take it.
 */
export function focusIsFree(next: Element): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  if (active.closest("[data-folded]")) return true;
  const form = active.closest("[data-widget-active]");
  if (form && form !== next && !next.contains(active)) return true;
  if (active instanceof HTMLInputElement && active.hasAttribute("data-ask-input")) return active.value === "";
  return false;
}

const TABBABLE = 'a[href], button:not([tabindex="-1"]), input:not([disabled]), select:not([disabled]), [tabindex="0"]';

/** Put the focus on the first thing in a component that can take it. */
export function focusFirstIn(container: Element): void {
  const target = container.querySelector<HTMLElement>(TABBABLE);
  target?.focus();
}
