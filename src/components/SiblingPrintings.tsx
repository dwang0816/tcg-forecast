"use client";

import Link from "next/link";
import { money } from "@/lib/format";
import { cardImageSources } from "@/lib/images";
import { variantLabel } from "@/lib/printings";
import { CardImage } from "./CardImage";
import type { SiblingPrinting } from "@/lib/queries";

/**
 * The other printings of a card — alternate art, parallel, wanted poster, base
 * — as a row of pills under the picture. Each pill names the variant and its
 * price, previews that printing's art on hover or keyboard focus, and links to
 * its own page. The current printing sits among them, marked, not linked.
 *
 * One Piece only for now: the sibling relationship is computed the same way for
 * every game, but whether it reads well on a Pokémon page is a separate
 * question, so the card page gates this to onepiece.
 */
export function SiblingPrintings({
  printings,
  currentId,
  game,
}: {
  printings: SiblingPrinting[];
  currentId: number;
  game: string;
}) {
  if (printings.length < 2) return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
        {printings.length} printings of this card
      </div>
      <div className="flex flex-wrap gap-1.5">
        {printings.map((p) => {
          const current = p.productId === currentId;
          const label = variantLabel(p.name);
          const price = p.marketPrice != null ? money(p.marketPrice) : "—";
          const sources = cardImageSources({
            game,
            number: p.number,
            imageUrl: p.imageUrl,
            altImageUrls: p.altImageUrls,
            ebayPhotoUrl: p.ebayPhotoUrl,
          });

          const inner = (
            <span className="flex items-baseline gap-1.5">
              <span className="font-medium">{label}</span>
              <span className="tabular-nums text-ink-faint">{price}</span>
            </span>
          );

          // Floating art preview. `hidden` until hover/focus so its <img>
          // (loading="lazy") doesn't fetch every sibling's picture up front —
          // only the one being pointed at.
          const preview = (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-32 -translate-x-1/2 group-hover/pill:block group-focus-within/pill:block">
              <div className="overflow-hidden rounded-lg border border-edge bg-graphite shadow-xl shadow-black/50">
                <div className="relative aspect-[5/7]">
                  <CardImage sources={sources} alt={p.name} />
                </div>
                <div className="truncate border-t border-edge px-2 py-1 text-center text-[10px] text-ink-dim">
                  {label} · {price}
                </div>
              </div>
            </div>
          );

          const pillBase =
            "block rounded-full border px-2.5 py-1.5 text-xs transition-colors";

          return (
            <div key={p.productId} className="group/pill relative">
              {current ? (
                <span
                  aria-current="true"
                  className={`${pillBase} border-gold/60 bg-gold/10 text-ink`}
                >
                  {inner}
                </span>
              ) : (
                <Link
                  href={`/card/${p.productId}`}
                  className={`${pillBase} border-edge bg-panel text-ink-dim hover:border-gold/40 hover:bg-panel-hi hover:text-ink`}
                >
                  {inner}
                </Link>
              )}
              {preview}
            </div>
          );
        })}
      </div>
    </div>
  );
}
