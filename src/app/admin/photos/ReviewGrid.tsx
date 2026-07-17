"use client";

import { useState, useTransition } from "react";
import { approve, reject, undo, replacePhoto } from "./actions";

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
  /** Times a human has called this card good or bad. Rerolls don't count. */
  reviewCount: number;
  /** What it's currently called, if anything. Re-judging overwrites it. */
  verdict: "good" | "bad" | null;
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
/**
 * How many times this card has been called.
 *
 * One per good/bad verdict — never a reroll, which is a request to see something
 * else, not a judgement. Hidden at 0: "reviewed ×0" is noise on a card nobody has
 * reached yet, and 0 is most of the queue.
 *
 * It climbs forever, because the queue is a rotation: judge a card and it goes to
 * the back, not away. A card at 4 has come round four times and been called four
 * times, which is a record of attention, not a warning.
 */
function ReviewCount({ n }: { n: number }) {
  if (n < 1) return null;
  const heavy = n >= 4;
  const warm = n >= 2;
  return (
    <span
      title={`Judged ${n} time${n === 1 ? "" : "s"} — this card has come round the queue ${n === 1 ? "once" : `${n} times`}`}
      className={`shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${
        heavy
          ? "border-gold/50 bg-gold/[0.16] text-gold-bright"
          : warm
            ? "border-gold/35 bg-gold/[0.10] text-gold-bright"
            : "border-edge bg-graphite text-ink-faint"
      }`}
    >
      reviewed ×{n}
    </span>
  );
}

/** What this card is called right now, so re-judging is a change, not a guess. */
function CurrentVerdict({ v }: { v: "good" | "bad" }) {
  return (
    <span
      title={`Currently marked ${v}. Judging it again replaces this and counts as another review.`}
      className={`shrink-0 rounded border px-1 py-px text-[9px] font-semibold uppercase tracking-wide ${
        v === "good"
          ? "border-up/40 bg-up/[0.12] text-up-bright"
          : "border-down/40 bg-down/[0.12] text-down-bright"
      }`}
    >
      {v === "good" ? "✓ good" : "✕ bad"}
    </span>
  );
}

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
  // A reroll is a live eBay round trip, so unlike a verdict it has to show that
  // it's working rather than pretend it's already done.
  const [hunting, setHunting] = useState<Record<number, boolean>>({});
  const [swapped, setSwapped] = useState<
    Record<
      number,
      {
        photoUrl: string;
        listingUrl: string;
        listingTitle: string;
        listingPrice: number | null;
        reviewCount: number;
      }
    >
  >({});
  const [noneLeft, setNoneLeft] = useState<Record<number, boolean>>({});
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

  /**
   * Swap in a different listing's photo, in place.
   *
   * NOT optimistic, unlike the verdicts: this one has to go to eBay and back, and
   * there's no sensible thing to show meanwhile except the truth. So the card
   * stays put and says it's looking.
   *
   * When nothing else exists the card STILL stays put, holding the photo it had.
   * It used to vanish, which read as a bug: the explanation rendered in a banner
   * at the top of the grid, so anyone scrolled down judging cards just watched
   * one evaporate. The answer belongs on the card you're looking at.
   */
  const reroll = (id: number) => {
    setHunting((h) => ({ ...h, [id]: true }));
    setFailed((f) => {
      const next = { ...f };
      delete next[id];
      return next;
    });
    startTransition(async () => {
      try {
        const photo = await replacePhoto(id);
        if (photo) {
          setSwapped((s) => ({ ...s, [id]: photo }));
          // A fresh photo is a fresh question, so any earlier "nothing else"
          // note no longer applies.
          setNoneLeft((n) => {
            const next = { ...n };
            delete next[id];
            return next;
          });
        } else {
          // eBay has nothing else. The card is untouched — it keeps the photo
          // it had — so it stays in the queue and just explains itself.
          setNoneLeft((n) => ({ ...n, [id]: true }));
        }
      } catch (e) {
        setFailed((f) => ({
          ...f,
          [id]: e instanceof Error ? e.message : "Couldn't reach eBay",
        }));
      } finally {
        setHunting((h) => {
          const next = { ...h };
          delete next[id];
          return next;
        });
      }
    });
  };

  const visible = cards.filter((c) => !judged[c.productId]);

  // This session's tally. Deliberately counts verdicts YOU gave in this sitting
  // rather than the queue total: the queue barely moves in a batch of 24, so it
  // never feels like anything is happening. This does, and it's a real number —
  // no points, no multipliers, just what you actually decided.
  const streak = Object.keys(judged).length;

  return (
    <div className="flex flex-col gap-4">
      {streak > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg border border-edge bg-panel px-3 py-2">
          <span
            aria-hidden
            className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gold"
          />
          <p className="font-mono text-[11px] tabular-nums text-ink-dim">
            {streak} judged this session
          </p>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-graphite">
            <div
              className="h-full rounded-full bg-gold transition-[width] duration-500 ease-out"
              style={{ width: `${(streak / cards.length) * 100}%` }}
            />
          </div>
          <p className="font-mono text-[11px] tabular-nums text-ink-faint">
            {visible.length} left in this batch
          </p>
        </div>
      )}

      {visible.length === 0 && cards.length > 0 && (
        <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-10 text-center text-sm text-ink-dim">
          That&apos;s this batch done. Reload for the next {cards.length}.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((raw) => {
          // A rerolled card carries the NEW listing, so the picture, the title
          // and the link all move together. Showing the new photo beside the old
          // seller's words would be its own kind of lie.
          const swap = swapped[raw.productId];
          const c: ReviewCard = swap
            ? {
                ...raw,
                photoUrl: swap.photoUrl,
                listingUrl: swap.listingUrl,
                listingTitle: swap.listingTitle,
                listingPrice: swap.listingPrice,
                reviewCount: swap.reviewCount,
                // A new picture is unjudged — replacePhoto clears the verdict
                // server-side, so the badge has to drop it here too.
                verdict: null,
                priceLabel:
                  swap.listingPrice != null
                    ? `$${swap.listingPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : null,
              }
            : raw;
          const busy = hunting[raw.productId];
          return (
          <div
            key={c.productId}
            className="flex flex-col overflow-hidden rounded-xl border border-edge bg-panel"
          >
            {/* Big enough to actually judge — the whole point is seeing the card. */}
            <a
              href={c.listingUrl ?? `/card/${c.productId}`}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="relative block aspect-[5/7] overflow-hidden bg-graphite"
              title="Open the eBay listing"
            >
              {c.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={c.photoUrl}
                  alt={c.name}
                  className={`h-full w-full object-contain transition-opacity ${busy ? "opacity-25" : ""}`}
                  loading="lazy"
                />
              ) : (
                <span className="flex h-full items-center justify-center font-mono text-xs text-ink-faint">
                  no photo
                </span>
              )}
              {busy && (
                <span className="absolute inset-0 flex items-center justify-center bg-graphite/70 font-mono text-xs text-ink-dim">
                  Searching eBay…
                </span>
              )}
              {swap && !busy && (
                <span className="absolute left-2 top-2 rounded border border-gold/40 bg-graphite/85 px-1.5 py-0.5 font-mono text-[9px] font-semibold uppercase tracking-wide text-gold-bright backdrop-blur">
                  new photo
                </span>
              )}
            </a>

            <div className="flex flex-1 flex-col gap-2 p-3">
              <div>
                <div className="line-clamp-2 font-display text-sm font-medium leading-snug text-ink">
                  {c.name}
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] tabular-nums text-ink-dim">
                  <span className="truncate">
                    {c.number ?? "—"}
                    {c.rarity ? ` · ${c.rarity}` : ""}
                  </span>
                  <ReviewCount n={c.reviewCount} />
                  {c.verdict && <CurrentVerdict v={c.verdict} />}
                </div>
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-ink-faint/70">
                  {c.gameName}
                  {c.language === "JP" ? " JP" : ""} · {c.groupName}
                </div>
              </div>

              {/* The seller's own words — the thing the matcher judged. Seeing it
                  next to the picture is how you catch a plausible title on a
                  photo of something else. */}
              {c.listingTitle && (
                <p className="line-clamp-2 rounded bg-graphite px-2 py-1 text-[11px] leading-snug text-ink-faint">
                  {c.listingTitle}
                </p>
              )}

              <div className="flex items-center justify-between font-mono text-[11px] text-ink-faint">
                <span>{c.valueLabel ? `worth ${c.valueLabel}` : "no price"}</span>
                {c.priceLabel && <span>listed {c.priceLabel}</span>}
              </div>

              {failed[c.productId] && (
                <p className="rounded border border-down/40 bg-down/10 px-2 py-1 font-mono text-[11px] text-down-bright">
                  {failed[c.productId]} — try again.
                </p>
              )}

              {/* Sits on the card, not in a banner up top: this is the answer to
                  a click you made on THIS card, and it has to be where your eyes
                  already are. */}
              {noneLeft[c.productId] && !busy && (
                <p className="rounded border border-gold/30 bg-gold/[0.07] px-2 py-1 text-[11px] leading-snug text-ink-dim">
                  <strong className="font-semibold text-gold-bright">
                    That&apos;s the only listing.
                  </strong>{" "}
                  eBay has nothing else for this card, so the photo above is
                  still the best there is — judge it with ✓ or ✕.
                </p>
              )}

              <div className="mt-auto flex flex-col gap-2 pt-1">
                {/* Undo only exists on the Good and Rejected views, where it
                    means "un-call this card" — back to never-judged, count and
                    all. In the queue you don't need it: a card already carries
                    its verdict and you just call it again. */}
                {reviewed ? (
                  <button
                    onClick={() => unjudge(c.productId)}
                    className="flex-1 rounded-lg border border-edge py-2 text-xs font-medium text-ink-dim transition-colors hover:border-gold/40 hover:bg-gold/[0.06] hover:text-gold-bright"
                    title={
                      c.photoUrl
                        ? "Clear this verdict and put the card back in the queue."
                        : "Clear this verdict and un-blacklist the photo, so a photo run can find it again."
                    }
                  >
                    Undo
                  </button>
                ) : (
                  <>
                  <div className="flex gap-2">
                    {/* The one place green/red isn't price movement. Approve and
                        reject is the convention those two colors were invented
                        for, and borrowing them here costs nothing: no price is
                        on screen for them to be confused with. */}
                    <button
                      onClick={() => decide(c.productId, "good")}
                      aria-label={`Good photo for ${c.name}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-up/40 bg-up/10 py-2.5 text-sm font-semibold text-up-bright transition-colors hover:bg-up/20"
                    >
                      <span aria-hidden>✓</span> Good
                    </button>
                    <button
                      onClick={() => decide(c.productId, "bad")}
                      aria-label={`Bad photo for ${c.name}`}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-down/40 bg-down/10 py-2.5 text-sm font-semibold text-down-bright transition-colors hover:bg-down/20"
                    >
                      <span aria-hidden>✕</span> Bad
                    </button>
                  </div>

                  {/* Under the verdicts, because it's the third answer to "is
                      this photo any good?" — not "yes" or "no" but "show me a
                      different one". Goes dead once eBay has been exhausted:
                      the same search can only return the same nothing, and a
                      button that re-answers a settled question is a trap. */}
                  <button
                    onClick={() => reroll(c.productId)}
                    disabled={busy || !c.photoUrl || Boolean(noneLeft[c.productId])}
                    aria-label={`Find a different photo for ${c.name}`}
                    className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-edge py-2 text-xs font-medium text-ink-faint transition-colors hover:border-ink-faint/40 hover:bg-panel-hi hover:text-ink-dim disabled:cursor-not-allowed disabled:opacity-40"
                    title={
                      noneLeft[c.productId]
                        ? "eBay has no other listing for this card — nothing left to find"
                        : "Look for a different live listing right now. Your photo stays if there's nothing better."
                    }
                  >
                    <span aria-hidden>⟳</span>
                    {busy
                      ? "Searching eBay…"
                      : noneLeft[c.productId]
                        ? "No other listing"
                        : "Find new photo"}
                  </button>
                  </>
                )}
              </div>
            </div>
          </div>
          );
        })}
      </div>
    </div>
  );
}
