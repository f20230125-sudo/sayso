/** The mark: a notched ticket in highlighter with a dashed stub line. Decoration; the name beside it carries the meaning. */
export function LogoMark({ className = "" }: { className?: string }) {
  return (
    <svg width="30" height="22" viewBox="0 0 30 22" aria-hidden="true" className={className}>
      <path
        d="M3 1.5H27A1.5 1.5 0 0 1 28.5 3V7.2A3.8 3.8 0 0 0 28.5 14.8V19A1.5 1.5 0 0 1 27 20.5H3A1.5 1.5 0 0 1 1.5 19V14.8A3.8 3.8 0 0 0 1.5 7.2V3A1.5 1.5 0 0 1 3 1.5Z"
        className="fill-mark stroke-mark-edge"
        strokeWidth="1.5"
      />
      <path d="M20 4.5V17.5" className="stroke-mark-edge" strokeWidth="1.5" strokeDasharray="2 2.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark />
      <span className="text-[18px] font-bold tracking-[-0.01em]">Sayso</span>
    </span>
  );
}
