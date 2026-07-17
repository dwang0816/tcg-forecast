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
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-2">
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
          {title}
        </h2>
        {rows.length > 0 && (
          <span className="font-mono text-[11px] text-ink-faint">
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
              productId={row.productId}
              rank={i + 1}
              name={row.name}
              groupName={row.groupName}
              imageUrl={row.imageUrl}
              altImageUrls={row.altImageUrls}
              ebayPhotoUrl={row.ebayPhotoUrl}
              subTypeName={row.subTypeName}
              rarity={row.rarity}
              number={row.number}
              setCode={row.setCode}
              price={row.curPrice}
              change={{ pct: row.pctChange, abs: row.absChange }}
              move={row.move}
              windowDays={windowDays}
              lowPrice={row.lowPrice}
              highPrice={row.highPrice}
              gameSlug={row.game}
              showBadge={showGameBadge}
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
