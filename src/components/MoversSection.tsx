import { CardTile } from "@/components/CardTile";
import { MoverRow } from "@/lib/queries";
import { formatDate, daysBetween } from "@/lib/format";

/**
 * A titled block of movers (top gainers or losers). Shows the true period
 * covered based on the returned rows, and a friendly empty state otherwise.
 */
export function MoversSection({
  title,
  rows,
  windowDays,
  showGameBadge = false,
  emptyBody,
}: {
  title: string;
  rows: MoverRow[];
  windowDays: number;
  showGameBadge?: boolean;
  emptyBody: string;
}) {
  const actualDays =
    rows.length > 0 ? daysBetween(rows[0].prevDate, rows[0].latestDate) : windowDays;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        {rows.length > 0 && (
          <span className="text-xs text-white/40">
            over {actualDays} day{actualDays === 1 ? "" : "s"} ·{" "}
            {formatDate(rows[0].prevDate)} → {formatDate(rows[0].latestDate)}
          </span>
        )}
      </div>

      {rows.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {rows.map((row, i) => (
            <CardTile
              key={`${row.productId}-${row.subTypeName}`}
              rank={i + 1}
              name={row.name}
              groupName={row.groupName}
              imageUrl={row.imageUrl}
              altImageUrls={row.altImageUrls}
              url={row.url}
              subTypeName={row.subTypeName}
              rarity={row.rarity}
              number={row.number}
              price={row.curPrice}
              change={{ pct: row.pctChange, abs: row.absChange }}
              gameSlug={row.game}
              showBadge={showGameBadge}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-8 text-center text-sm text-white/40">
          {emptyBody}
        </p>
      )}
    </section>
  );
}
