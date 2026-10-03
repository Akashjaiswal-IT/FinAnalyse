/** The mark: a market wave whose crest becomes the stem of a T. */
export function Logo({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="flex items-center gap-2">
        <svg viewBox="0 0 28 28" className="size-7" aria-hidden>
          <path d="M3 13c3.2-5.5 6.4 1.6 9.6-3.2S18.4 4 25 8.6" fill="none" stroke="var(--primary)" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M13.8 11.2V24" stroke="var(--foreground)" strokeWidth="2.4" strokeLinecap="round" />
          <circle cx="25" cy="8.6" r="1.9" fill="var(--primary)" />
        </svg>
        <span className="leading-none">
          <span className="block text-[15px] font-semibold tracking-[-0.01em] text-foreground">Tempest</span>
          <span className="mt-0.5 hidden text-[10px] tracking-wide text-muted-foreground xl:block">Portfolio intelligence</span>
        </span>
      </span>
    </span>
  );
}
