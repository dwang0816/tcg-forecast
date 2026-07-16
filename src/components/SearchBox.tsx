/**
 * Plain GET form — no JS needed, results are server-rendered and the URL is
 * shareable. Lives in the header (jump to any card) and on the search page.
 */
export function SearchBox({
  defaultValue = "",
  autoFocus = false,
  compact = false,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  return (
    <form action="/search" method="GET" className={compact ? "" : "w-full"} role="search">
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
          ⌕
        </span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          placeholder={compact ? "Search cards…" : "Search by card name or number — e.g. Charizard, OP01-024"}
          aria-label="Search cards"
          className={`w-full rounded-lg border border-white/10 bg-white/[0.04] pl-8 pr-3 text-white placeholder:text-white/30 focus:border-white/25 focus:outline-none ${
            compact ? "h-8 text-xs sm:w-56" : "h-11 text-sm"
          }`}
        />
      </div>
    </form>
  );
}
