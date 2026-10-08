// Portfolio Ledger mark: ruled ledger lines with the value line rising across them.
// Colours come from the theme tokens, so it follows light/dark like the rest of the UI.
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <svg className={`logo ${className ?? ''}`} width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      <path d="M8 10.5h16M8 16h16M8 21.5h16" stroke="var(--accent-ink)" strokeOpacity="0.28" strokeWidth="1.4" strokeLinecap="round" />
      <path d="M8 22.5l5.2-5.6 4 2.9 5.6-7.3" fill="none" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23.2" cy="12.2" r="2.7" fill="var(--series-3)" stroke="var(--accent)" strokeWidth="1.4" />
    </svg>
  );
}
