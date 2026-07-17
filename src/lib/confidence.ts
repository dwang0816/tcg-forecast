/**
 * How much should we trust a card's price?
 *
 * tcgcsv gives us no sales volume, so we can't directly tell "sold 40 times" from
 * "listed once, never sold". But the spread between the lowest and highest active
 * listing is a usable proxy for how settled a price is: when sellers cluster
 * tightly the market agrees, and when the high is 10x the low nobody knows what
 * the card is worth. Measured across our data, most Pokémon cards fall in the
 * wide-spread bucket — which is exactly why raw price movement is so noisy.
 *
 * This is deliberately a *confidence* signal, not a *value* signal:
 *  - Most Valuable still ranks by price (a $5,000 card is valuable even if the
 *    market is thin) — confidence is shown, not applied.
 *  - Movers rank by price change TIMES confidence, so an erratic swing on an
 *    illiquid card can't outrank a real move on a liquid one.
 *
 * When eBay sold data lands it becomes the top confidence tier, and once we have
 * enough daily snapshots, price stability folds in here as a second factor.
 */

export type ConfidenceTier = "high" | "medium" | "low";

/** high/low ratio of active listings. 1 = all sellers agree; 10 = chaos. */
export function spreadRatio(
  low: number | null | undefined,
  high: number | null | undefined,
): number | null {
  if (low == null || high == null || low <= 0 || high <= 0) return null;
  return high / low;
}

/** 0..1 multiplier used to damp noisy movers. Keep in sync with SQL_CONFIDENCE. */
export function confidenceFactor(
  low: number | null | undefined,
  high: number | null | undefined,
): number {
  const r = spreadRatio(low, high);
  if (r == null) return 0.5; // unknown spread — neither trusted nor punished
  if (r < 2) return 1;
  if (r < 4) return 0.8;
  if (r < 10) return 0.55;
  return 0.3;
}

export function confidenceTier(
  low: number | null | undefined,
  high: number | null | undefined,
): ConfidenceTier {
  const f = confidenceFactor(low, high);
  if (f >= 0.8) return "high";
  if (f >= 0.55) return "medium";
  return "low";
}

export const CONFIDENCE_LABEL: Record<ConfidenceTier, string> = {
  high: "Tight spread — sellers agree on this price",
  medium: "Moderate spread — price is somewhat unsettled",
  low: "Wide spread — little agreement on what this is worth",
};

/**
 * The short name for a tier. This is the ONLY place the spread gets a word.
 *
 * It lived in ConfidenceBadge and got copied into the movers score, which put two
 * vocabularies for one fact on the same tile: the badge called a 3.2x spread
 * "confident" while the score called it "moderate spread", and "wide spread" meant
 * factor 0.3 to the badge but 0.55 to the score. Same phrase, two meanings, side by
 * side. Both read from here now, so they can't drift apart again.
 */
export const CONFIDENCE_TEXT: Record<ConfidenceTier, string> = {
  high: "confident",
  medium: "unsettled",
  low: "wide spread",
};
