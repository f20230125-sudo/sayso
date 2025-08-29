import type { ButtonHTMLAttributes, ReactNode } from "react";

// The few building blocks every screen shares.

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md";
};

// The primary button is the highlighter: a mark fill with ink text and an ink edge.
const VARIANTS: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "border-[1.5px] border-mark-edge bg-mark text-on-mark hover:shadow-[inset_0_0_0_1px_var(--mark-edge)]",
  outline: "border-[1.5px] border-ink bg-paper text-ink hover:bg-paper-2",
  ghost: "border-[1.5px] border-transparent text-ink-2 underline decoration-ink-3 underline-offset-4 hover:bg-paper-2 hover:text-ink",
  danger: "border-[1.5px] border-bad bg-paper text-bad hover:bg-paper-2",
};

/** What a control that cannot be used right now looks like. It is aria-disabled, not disabled, so it keeps the focus. */
const UNAVAILABLE =
  "aria-disabled:cursor-not-allowed aria-disabled:border-dashed aria-disabled:border-edge aria-disabled:bg-paper-2 aria-disabled:text-ink-3 aria-disabled:no-underline aria-disabled:shadow-none aria-disabled:hover:bg-paper-2";

export function Button({ variant = "outline", size = "md", className = "", type = "button", disabled = false, onClick, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      aria-disabled={disabled || undefined}
      onClick={(event) => {
        // Not `disabled`: that would drop the focus. The click is refused instead.
        if (disabled) {
          event.preventDefault();
          return;
        }
        onClick?.(event);
      }}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-control font-bold transition-[background-color,box-shadow,color] duration-150 ${
        size === "sm" ? "h-8 px-3 text-[13px]" : `h-10 px-4 text-[15px] ${variant === "primary" ? "max-sm:h-11" : ""}`
      } ${VARIANTS[variant]} ${UNAVAILABLE} ${className}`}
      {...rest}
    />
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  /** Read by screen readers and shown as the tooltip. */
  label: string;
  children: ReactNode;
};

export function IconButton({ label, className = "", type = "button", children, ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control text-ink-2 transition-colors duration-150 hover:bg-paper-2 hover:text-ink ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * A value written on a rule, with its caption underneath. It goes in a
 * <dl>: the term comes first in the source, so a screen reader says "Seat,
 * 9C", and last on the page, under the line.
 */
export function Field({ label, value, mono = false, className = "" }: { label: string; value: ReactNode; mono?: boolean; className?: string }) {
  return (
    <div className={`flex min-w-0 flex-col-reverse justify-end ${className}`}>
      <dt className="mt-1 text-[12.5px] leading-snug text-ink-3">{label}</dt>{" "}
      <dd className={`border-b-[1.5px] border-ink pb-1 text-[17px] font-bold leading-snug ${mono ? "font-mono tracking-[0.02em]" : ""}`}>{value}</dd>
    </div>
  );
}

/** The tear-off line of a document that has one. Notches mark where it crosses a box. */
export function Perforation({ notches = true, className = "" }: { notches?: boolean; className?: string }) {
  return <div aria-hidden="true" className={`perf ${notches ? "perf-notched" : ""} ${className}`} />;
}

/** A key on the keyboard. */
export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-seat border border-edge bg-paper-2 px-1.5 py-0.5 font-mono text-[12px] text-ink-2">{children}</kbd>;
}
