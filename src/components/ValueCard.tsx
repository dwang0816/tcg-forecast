import { money } from "@/lib/format";
import { GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { cardImageSources } from "@/lib/images";
import { CardImage } from "@/components/CardImage";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { ValuableRow } from "@/lib/queries";

/**
 * Rich "Most Valuable" card: image plus a price panel showing TCGplayer market
 * and average-listing prices, with labeled eBay slots reserved for when a
 * sold-data source is wired in.
 */
export function ValueCard({ row, rank }: { row: ValuableRow; rank: number }) {
  const game = isGameSlug(row.game) ? GAME_BY_SLUG[row.game] : null;
  const sources = cardImageSources({
    game: row.game,
    number: row.number,
    imageUrl: row.imageUrl,
    altImageUrls: row.altImageUrls,
  });

  return (
    <a
      href={row.url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-black/30">
        <CardImage sources={sources} alt={row.name} />
        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white/80 backdrop-blur">
          #{rank}
        </span>
        {row.subTypeName && row.subTypeName !== "Normal" && (
          <span className="absolute right-2 top-2 rounded-md bg-sky-500/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
            {row.subTypeName}
          </span>
        )}
        {game && (
          <span
            className={`absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${game.accent}`}
          >
            {game.name}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-2 p-3">
        <div>
          <div className="line-clamp-2 text-sm font-medium leading-snug text-white/90">
            {row.name}
          </div>
          <div className="line-clamp-1 text-xs text-white/40">
            {row.groupName}
            {row.rarity ? ` · ${row.rarity}` : ""}
          </div>
          <div className="mt-1.5">
            <ConfidenceBadge low={row.lowPrice} high={row.highPrice} />
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-1.5 rounded-lg bg-black/20 p-2.5 text-xs">
          <PriceRow
            label="TCG market"
            value={row.marketPrice != null ? money(row.marketPrice) : "N/A"}
            emphasis={row.marketPrice != null}
            faded={row.marketPrice == null}
          />
          <PriceRow
            label="TCG listing avg"
            value={row.listingPrice != null ? money(row.listingPrice) : "N/A"}
          />

          <div className="my-0.5 border-t border-white/10" />

          <PriceRow label="eBay avg (last 6)" value="—" faded />
          <div className="flex flex-col gap-1">
            <span className="text-[11px] text-white/35">eBay last 10 sold</span>
            <div className="flex flex-wrap gap-1">
              {Array.from({ length: 10 }).map((_, i) => (
                <span
                  key={i}
                  className="h-4 w-7 rounded bg-white/[0.04]"
                  aria-hidden
                />
              ))}
            </div>
            <span className="text-[10px] italic text-white/25">
              sold data coming soon
            </span>
          </div>
        </div>
      </div>
    </a>
  );
}

function PriceRow({
  label,
  value,
  emphasis,
  faded,
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  faded?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={faded ? "text-white/30" : "text-white/45"}>{label}</span>
      <span
        className={`tabular-nums ${
          emphasis
            ? "text-sm font-semibold text-white"
            : faded
              ? "text-white/30"
              : "text-white/80"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
