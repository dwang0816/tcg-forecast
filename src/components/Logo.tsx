/**
 * The brand mark: three candlesticks stepping up, the last one green.
 *
 * It's the logo, so the colors are literal rather than themed — a mark that
 * shifts with its surroundings isn't a mark. The wicks are what make it read as
 * a price chart instead of a bar chart, and they're the first thing to go at
 * small sizes (below ~24px they collapse into the body), so `wicks` drops them.
 */
export function Mark({
  size = 32,
  wicks = true,
  className,
}: {
  size?: number;
  wicks?: boolean;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 58 58"
      className={className}
      aria-hidden
      focusable="false"
    >
      <rect
        x="1"
        y="1"
        width="56"
        height="56"
        rx="14"
        fill="#141419"
        stroke="oklch(0.8 0.13 85)"
        strokeWidth="1.5"
      />
      {wicks ? (
        <>
          <rect x="14" y="30" width="5" height="16" rx="1" fill="oklch(0.8 0.13 85)" />
          <line x1="16.5" y1="24" x2="16.5" y2="30" stroke="oklch(0.8 0.13 85)" strokeWidth="1.5" />
          <rect x="26" y="22" width="5" height="20" rx="1" fill="oklch(0.8 0.13 85)" />
          <line x1="28.5" y1="16" x2="28.5" y2="22" stroke="oklch(0.8 0.13 85)" strokeWidth="1.5" />
          <rect x="38" y="14" width="5" height="26" rx="1" fill="oklch(0.75 0.16 150)" />
          <line x1="40.5" y1="9" x2="40.5" y2="14" stroke="oklch(0.75 0.16 150)" strokeWidth="1.5" />
        </>
      ) : (
        <>
          <rect x="15" y="30" width="6" height="15" rx="1" fill="oklch(0.8 0.13 85)" />
          <rect x="26" y="23" width="6" height="22" rx="1" fill="oklch(0.8 0.13 85)" />
          <rect x="37" y="15" width="6" height="30" rx="1" fill="oklch(0.75 0.16 150)" />
        </>
      )}
    </svg>
  );
}

/**
 * "TCG.Forecast" — the dot is gold and load-bearing; it's the only place the
 * wordmark carries color, and it's what makes the name a domain rather than a
 * sentence. Never render the name as plain text where this would fit.
 */
export function Wordmark({
  className = "text-2xl",
}: {
  /** Size the wordmark by passing a text-* class; the dot follows along. */
  className?: string;
}) {
  return (
    <span
      className={`font-display font-bold tracking-[-0.02em] text-ink ${className}`}
    >
      TCG<span className="text-gold">.</span>Forecast
    </span>
  );
}

/** Mark + wordmark + tagline, as specified by the brand's primary lockup. */
export function Lockup({
  size = 56,
  tagline = true,
}: {
  size?: number;
  tagline?: boolean;
}) {
  return (
    <span className="flex items-center gap-4">
      <Mark size={size} className="shrink-0" />
      <span className="flex flex-col gap-2 leading-none">
        <Wordmark className="text-3xl sm:text-4xl" />
        {tagline && (
          <span className="font-mono text-[10px] tracking-[0.4em] text-ink-faint">
            MARKET SIGNALS FOR CARDS
          </span>
        )}
      </span>
    </span>
  );
}
