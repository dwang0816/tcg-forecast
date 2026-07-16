// Decides which cards are worth tracking (snapshotting prices for). Keeping the
// working set to genuinely valuable cards cuts DB size + query cost, and defines
// the small set we'd query eBay for (per-card eBay lookups are expensive).

/** A card is "valuable" at or above this market/listing price (USD). */
export const TRACK_FLOOR = 20;

// Bulk low-value rarities. A card of one of these that also has no usable price
// is dropped; anything else with no price is rescued (likely a chase grail).
const COMMON_RARITIES: Record<string, string[]> = {
  onepiece: ["C", "UC", "DON!!"],
  pokemon: ["Common", "Uncommon"],
  riftbound: ["Common", "Uncommon", "None"],
};

/**
 * Track a card if it's worth >= TRACK_FLOOR, OR it has no usable TCGplayer price
 * but is a non-common rarity (a chase card TCGplayer can't price — an eBay
 * target, e.g. the "Red Super Alternate Art" SECs).
 */
export function isTracked(opts: {
  game: string;
  rarity: string | null;
  sanePrice: number | null;
}): boolean {
  if (opts.sanePrice != null) return opts.sanePrice >= TRACK_FLOOR;
  if (!opts.rarity) return false;
  const common = COMMON_RARITIES[opts.game] ?? [];
  return !common.includes(opts.rarity);
}

/** TCGplayer's listing prices, ignoring its >=99999 "no data" sentinels. */
export function sanePrice(p: {
  marketPrice: number | null;
  midPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
}): number | null {
  const ok = (n: number | null) => (n != null && n < 99999 ? n : null);
  return p.marketPrice ?? ok(p.midPrice) ?? ok(p.lowPrice) ?? ok(p.highPrice);
}
