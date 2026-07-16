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
}: {
  title: string;
  subtitle?: string;
  rows: ValuableRow[];
  tone?: "normal" | "warning";
}) {
  if (rows.length === 0) return null;

  return (
    <section className="flex flex-col gap-3">
      <div
        className={`flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b pb-2 ${
          tone === "warning" ? "border-amber-500/25" : "border-white/10"
        }`}
      >
        <h2
          className={`text-lg font-semibold ${
            tone === "warning" ? "text-amber-200/90" : ""
          }`}
        >
          {title}
        </h2>
        <span className="text-xs text-white/40">top {rows.length}</span>
        {subtitle && (
          <p className="w-full text-xs text-white/40">{subtitle}</p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {rows.map((row, i) => (
          <ValueCard
            key={`${row.productId}-${row.subTypeName}`}
            row={row}
            rank={i + 1}
          />
        ))}
      </div>
    </section>
  );
}
