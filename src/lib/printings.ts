// A card's "printings" are the separate TCGplayer products for one card's
// variants — the plain print, the alternate art, the parallel, the wanted
// poster, and so on. TCGplayer files each as its own product with its own
// price, and they're tied together by sharing a set, a number, and a name.

/**
 * The card's leading identity — its name with any variant, number, or bracket
 * suffix stripped. "Sabo (120) (Parallel)" and "Sabo (120)" both reduce to
 * "Sabo"; "Donquixote Doflamingo - OP14-060 (Alternate Art)" to "Donquixote
 * Doflamingo".
 *
 * This is the line between a variant and a different card, and it's
 * load-bearing: ingest uses it to decide which printings may lend each other
 * art, and getSiblingPrintings uses the same rule so the two never disagree.
 * A set's card numbers aren't reliably unique (L1: HeartGold has both Ampharos
 * and Donphan at 034/070), so number alone can't group printings — the identity
 * has to match too.
 */
export function identityOf(name: string): string {
  return name.split(" (")[0].split(" [")[0].split(" - ")[0].trim();
}

/**
 * The short label for a printing's pill — what makes this variant distinct.
 * It's the trailing parenthetical(s) that aren't just the card's number:
 * "Parallel", "Alternate Art", "Red Super Alternate Art". The plain printing
 * has none, and reads as "Base".
 *
 *   "Sabo (120) (Parallel)"                 -> "Parallel"
 *   "Sabo (120)"                            -> "Base"
 *   "Doflamingo - OP14-060 (Alternate Art)" -> "Alternate Art"
 */
export function variantLabel(name: string): string {
  const parens = [...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const meaningful = parens.filter((p) => p && !/^\d+$/.test(p));
  return meaningful.length ? meaningful.join(" · ") : "Base";
}
