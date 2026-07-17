import { ValueCard } from "@/components/ValueCard";
import { ValuableRow } from "@/lib/queries";

/**
 * A titled grid of value cards. Used for both the confirmed-value list and the
 * separate "asking price only" list, which is labeled so unsold fantasy prices
 * are never mistaken for real value.
 */
export function ValueSection({
  title,
  subtitle,
  rows,
  tone = "normal",
  emptyBody = "Nothing to show here yet.",
}: {
  title: string;
  subtitle?: string;
  rows: ValuableRow[];
  tone?: "normal" | "warning";
  emptyBody?: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2 ${
          tone === "warning" ? "border-gold/30" : "border-edge"
        }`}
      >
        <h2
          className={`font-display text-lg font-bold tracking-tight ${
            tone === "warning" ? "text-gold-bright" : "text-ink"
          }`}
        >
          {title}
        </h2>
        {rows.length > 0 && (
          <span className="font-mono text-[11px] text-ink-faint">
            top {rows.length}
          </span>
        )}
        {subtitle && (
          <p className="w-full text-xs leading-relaxed text-ink-dim">{subtitle}</p>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {rows.map((row, i) => (
            <ValueCard
              key={`${row.productId}-${row.subTypeName}`}
              row={row}
              rank={i + 1}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-8 text-center text-sm text-ink-dim">
          {emptyBody}
        </p>
      )}
    </section>
  );
}
