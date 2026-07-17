import Link from "next/link";
import { money, percent, signedMoney } from "@/lib/format";
import { GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { cardImageSources, hasOfficialArt } from "@/lib/images";
import { CardImage } from "@/components/CardImage";
import { CardIdentity } from "@/components/CardIdentity";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { GameTag } from "@/components/GameTag";

export interface CardTileProps {
  productId: number;
  rank: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  altImageUrls?: string[] | null;
  ebayPhotoUrl?: string | null;
  subTypeName: string;
  rarity: string | null;
  number: string | null;
  setCode?: string | null;
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
  productId,
  rank,
  name,
  groupName,
  imageUrl,
  altImageUrls,
  ebayPhotoUrl,
  subTypeName,
  rarity,
  number,
  setCode,
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
  const sources = cardImageSources({ game: gameSlug, number, imageUrl, altImageUrls, ebayPhotoUrl });
  // See ValueCard: an unlabelled seller photo reads as the card's artwork.
  const listingPhoto = !hasOfficialArt({ imageUrl, altImageUrls }) && Boolean(ebayPhotoUrl);

  return (
    <Link
      href={`/card/${productId}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-edge bg-panel transition-colors hover:border-gold/40 hover:bg-panel-hi"
    >
      <div className="relative aspect-[5/7] overflow-hidden bg-graphite">
        <CardImage sources={sources} alt={name} />

        <span className="absolute left-2 top-2 rounded-md bg-graphite/80 px-1.5 py-0.5 font-mono text-[10px] font-semibold tabular-nums text-ink-dim backdrop-blur">
          #{rank}
        </span>

        {subTypeName && subTypeName !== "Normal" && (
          <span className="absolute right-2 top-2 rounded-md border border-gold/40 bg-graphite/80 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-gold-bright backdrop-blur">
            {subTypeName}
          </span>
        )}

        {showBadge && game && (
          <GameTag game={game} size="sm" className="absolute bottom-2 left-2" />
        )}
        {listingPhoto && (
          <span
            className="absolute bottom-2 right-2 rounded bg-graphite/85 px-1.5 py-0.5 font-mono text-[9px] text-ink-faint backdrop-blur"
            title="No official art exists for this card — this is a photo from a live eBay listing."
          >
            listing photo
          </span>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="line-clamp-2 font-display text-sm font-medium leading-snug text-ink">
          {name}
        </div>
        <CardIdentity number={number} setCode={setCode} rarity={rarity} groupName={groupName} />
        {(lowPrice != null || highPrice != null) && (
          <div className="mt-0.5">
            <ConfidenceBadge low={lowPrice ?? null} high={highPrice ?? null} />
          </div>
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="flex flex-col">
            {/* The price wears its own direction: green if this card is up, red
                if it's down. Falls back to plain ink rather than a guess when
                there's no change to read — no arrow, no color. */}
            <span
              className={`font-mono text-base font-semibold tabular-nums ${
                change ? (up ? "text-up-bright" : "text-down-bright") : "text-ink"
              }`}
            >
              {money(price)}
            </span>
            {priceType === "listing" && (
              <span
                className="font-mono text-[9px] uppercase tracking-wide text-ink-faint"
                title="TCGplayer has no confirmed market price for this card — this is a current seller asking price."
              >
                asking · no market
              </span>
            )}
          </span>

          {change && (
            <span
              className={`flex flex-col items-end rounded-md border px-2 py-1 text-right font-mono text-xs font-semibold tabular-nums ${
                up
                  ? "border-up/40 bg-up/10 text-up-bright"
                  : "border-down/40 bg-down/10 text-down-bright"
              }`}
            >
              <span>
                {up ? "▲" : "▼"} {percent(change.pct)}
              </span>
              <span className="text-[10px] font-normal opacity-70">
                {signedMoney(change.abs)}
              </span>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
