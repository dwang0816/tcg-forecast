import { money, percent, signedMoney } from "@/lib/format";
import { GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { cardImageSources } from "@/lib/images";
import { CardImage } from "@/components/CardImage";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";

export interface CardTileProps {
  rank: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  altImageUrls?: string[] | null;
  url: string | null;
  subTypeName: string;
  rarity: string | null;
  number: string | null;
  price: number;
  change?: { pct: number; abs: number } | null;
  /** Listing spread, for the confidence badge. */
  lowPrice?: number | null;
  highPrice?: number | null;
  /** "listing" marks an asking-price fallback (no confirmed TCGplayer market). */
  priceType?: "market" | "listing";
  /** Game slug — used to source fallback images and (with showBadge) the label. */
  gameSlug?: string;
  /** Show the game badge (cross-game views only). */
  showBadge?: boolean;
}

export function CardTile({
  rank,
  name,
  groupName,
  imageUrl,
  altImageUrls,
  url,
  subTypeName,
  rarity,
  number,
  price,
  change,
  lowPrice,
  highPrice,
  priceType = "market",
  gameSlug,
  showBadge = false,
}: CardTileProps) {
  const up = change ? change.pct >= 0 : false;
  const game = gameSlug && isGameSlug(gameSlug) ? GAME_BY_SLUG[gameSlug] : null;
  const sources = cardImageSources({ game: gameSlug, number, imageUrl, altImageUrls });

  return (
    <a
      href={url ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03] transition-colors hover:border-white/20 hover:bg-white/[0.06]"
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-black/30">
        <CardImage sources={sources} alt={name} />

        <span className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-xs font-semibold tabular-nums text-white/80 backdrop-blur">
          #{rank}
        </span>

        {subTypeName && subTypeName !== "Normal" && (
          <span className="absolute right-2 top-2 rounded-md bg-sky-500/80 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur">
            {subTypeName}
          </span>
        )}

        {showBadge && game && (
          <span
            className={`absolute bottom-2 left-2 rounded-md px-1.5 py-0.5 text-[10px] font-semibold text-white ${game.accent}`}
          >
            {game.name}
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 text-sm font-medium leading-snug text-white/90">
          {name}
        </div>
        <div className="line-clamp-1 text-xs text-white/40">
          {groupName}
          {rarity ? ` · ${rarity}` : ""}
        </div>
        {(lowPrice != null || highPrice != null) && (
          <div className="mt-0.5">
            <ConfidenceBadge low={lowPrice ?? null} high={highPrice ?? null} />
          </div>
        )}

        <div className="mt-auto flex items-end justify-between pt-2">
          <span className="flex flex-col">
            <span className="text-base font-semibold tabular-nums text-white">
              {money(price)}
            </span>
            {priceType === "listing" && (
              <span
                className="text-[9px] font-medium uppercase tracking-wide text-amber-400/80"
                title="TCGplayer has no confirmed market price for this card — this is a current seller asking price."
              >
                asking · no market
              </span>
            )}
          </span>

          {change && (
            <span
              className={`flex flex-col items-end rounded-md px-2 py-1 text-right text-xs font-semibold tabular-nums ${
                up
                  ? "bg-emerald-500/15 text-emerald-400"
                  : "bg-rose-500/15 text-rose-400"
              }`}
            >
              <span>{percent(change.pct)}</span>
              <span className="text-[10px] font-normal opacity-70">
                {signedMoney(change.abs)}
              </span>
            </span>
          )}
        </div>
      </div>
    </a>
  );
}
