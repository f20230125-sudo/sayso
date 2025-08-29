import Link from "next/link";
import { LogoMark } from "@/components/Logo";

export default function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="mx-auto flex h-full w-full max-w-[1280px] flex-col justify-center gap-4 px-5 py-10 md:px-10">
      <LogoMark />
      <h1 className="max-w-[20ch] text-[34px] font-bold leading-[1.06] tracking-[-0.02em] sm:text-[44px]">There is no page at this address</h1>
      <p className="max-w-[44ch] text-ink-2">The link may be mistyped, or the page may have moved.</p>
      <div>
        <Link
          href="/"
          className="inline-flex h-11 items-center justify-center rounded-control border-[1.5px] border-mark-edge bg-mark px-5 text-[15px] font-bold text-on-mark hover:shadow-[inset_0_0_0_1px_var(--mark-edge)]"
        >
          Go to the desk
        </Link>
      </div>
    </main>
  );
}
