/**
 * Plain GET form — no JS needed, results are server-rendered and the URL is
 * shareable. Lives in the header (jump to any card) and on the search page.
 */
export function SearchBox({
  defaultValue = "",
  autoFocus = false,
  compact = false,
  action = "/search",
  placeholder,
  hidden,
}: {
  defaultValue?: string;
  autoFocus?: boolean;
  compact?: boolean;
  /** Where the form submits. Defaults to the global card search. */
  action?: string;
  placeholder?: string;
  /** Filters to carry through the submit — see below. */
  hidden?: Record<string, string>;
}) {
  return (
    <form action={action} method="GET" className={compact ? "" : "w-full"} role="search">
      {/* A GET form replaces the entire query string with its own fields, so any
          filter already in the URL has to ride along or submitting the search
          silently resets it. */}
      {hidden &&
        Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}
      <div className="relative">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gold/60">
          ⌕
        </span>
        <input
          type="search"
          name="q"
          defaultValue={defaultValue}
          autoFocus={autoFocus}
          placeholder={
            placeholder ??
            (compact
              ? "Search cards…"
              : "Search by card name or number — e.g. Charizard, OP01-024")
          }
          aria-label="Search cards"
          className={`w-full rounded-lg border border-edge bg-panel pl-8 pr-3 text-ink transition-colors placeholder:text-ink-faint/70 focus:border-gold/50 focus:bg-panel-hi focus:outline-none ${
            compact ? "h-8 text-xs sm:w-56" : "h-11 text-sm"
          }`}
        />
      </div>
    </form>
  );
}
