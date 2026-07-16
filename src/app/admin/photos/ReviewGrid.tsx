"use client";

import { useState, useTransition } from "react";
import { approve, reject, undo } from "./actions";

export interface ReviewCard {
  productId: number;
  gameName: string;
  language: string;
  name: string;
  groupName: string;
  rarity: string | null;
  number: string | null;
  photoUrl: string | null;
  listingUrl: string | null;
  listingTitle: string | null;
  listingPrice: number | null;
  value: number | null;
  valueLabel: string | null;
  priceLabel: string | null;
}

/**
 * The review queue.
 *
 * Optimistic on purpose: judging 228 photos means 228 round trips, and waiting
 * for each one turns a ten-minute job into an afternoon. A card leaves the grid
 * the instant you click, and the write happens behind you. If it fails the card
 * comes back with the error visible — losing a verdict silently would be worse
 * than a slow page.
 */
export function ReviewGrid({
  cards,
  reviewed,
}: {
  cards: ReviewCard[];
  reviewed: boolean;
}) {
  // Locally judged, so the card disappears without waiting for the server.
  const [judged, setJudged] = useState<Record<number, "good" | "bad">>({});
  const [failed, setFailed] = useState<Record<number, string>>({});
  const [, startTransition] = useTransition();

  const decide = (id: number, verdict: "good" | "bad") => {
    setJudged((j) => ({ ...j, [id]: verdict }));
    setFailed((f) => {
      const next = { ...f };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      try {
        await (verdict === "good" ? approve(id) : reject(id));
      } catch (e) {
        // Put it back rather than pretend it saved.
        setJudged((j) => {
          const next = { ...j };
          delete next[id];
          return next;
        });
        setFailed((f) => ({ ...f, [id]: e instanceof Error ? e.message : "Didn't save" }));
      }
    });
  };

  const unjudge = (id: number) => {
    startTransition(async () => {
      await undo(id);
    });
  };

  const visible = cards.filter((c) => !judged[c.productId]);

  return (
    <div className="flex flex-col gap-4">
      {visible.length === 0 && cards.length > 0 && (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-white/40">
          That&apos;s this batch done. Reload for the next {cards.length}.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((c) => (
          <div
            key={c.productId}
            className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]"
          >
            {/* Big enough to actually judge — the whole point is seeing the card. */}
            <a
              href={c.listingUrl ?? `/card/${c.productId}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="relative block aspect-[5/7] overflow-hidden bg-black/40"
              title="Open the eBay listing"
            >
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photoUrl}
                  alt={c.name}
                  className="h-full w-full object-contain"
                  loading="lazy"
                />
              ) : (
                <span className="flex h-full items-center justify-center text-xs text-white/30">
                  no photo
                </span>
              )}
            </a>

            <div className="flex flex-1 flex-col gap-2 p-3">
              <div>
                <div className="line-clamp-2 text-sm font-medium leading-snug text-white/90">
                  {c.name}
                </div>
                <div className="mt-0.5 text-xs tabular-nums text-white/55">
                  {c.number ?? "—"}
                  {c.rarity ? ` · ${c.rarity}` : ""}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-white/35">
                  {c.gameName}
                  {c.language === "JP" ? " JP" : ""} · {c.groupName}
                </div>
              </div>

              {/* The seller's own words — the thing the matcher judged. Seeing it
                  next to the picture is how you catch a plausible title on a
                  photo of something else. */}
              {c.listingTitle && (
                <p className="line-clamp-2 rounded bg-black/25 px-2 py-1 text-[11px] leading-snug text-white/40">
                  {c.listingTitle}
                </p>
              )}

              <div className="flex items-center justify-between text-[11px] text-white/35">
                <span>{c.valueLabel ? `worth ${c.valueLabel}` : "no price"}</span>
                {c.priceLabel && <span>listed {c.priceLabel}</span>}
              </div>

              {failed[c.productId] && (
                <p className="rounded bg-rose-500/15 px-2 py-1 text-[11px] text-rose-300">
                  {failed[c.productId]} — try again.
                </p>
              )}

              <div className="mt-auto flex gap-2 pt-1">
                {reviewed ? (
                  <button
                    onClick={() => unjudge(c.productId)}
                    className="flex-1 rounded-lg border border-white/15 py-2 text-xs font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white"
                  >
                    Undo
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => decide(c.productId, "good")}
                      aria-label={`Good photo for ${c.name}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/[0.12] py-2.5 text-sm font-semibold text-emerald-400 transition-colors hover:bg-emerald-500/25"
                    >
                      <span aria-hidden>✓</span> Good
                    </button>
                    <button
                      onClick={() => decide(c.productId, "bad")}
                      aria-label={`Bad photo for ${c.name}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/[0.12] py-2.5 text-sm font-semibold text-rose-400 transition-colors hover:bg-rose-500/25"
                    >
                      <span aria-hidden>✕</span> Bad
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
