// A reference MSRP for sealed products, so a page can show what a box cost at
// retail next to what it trades for now.
//
// There is no MSRP in TCGplayer's feed, so this is a small CURATED table. It
// only covers the handful of formats whose retail price is standardised and
// stable within the current era — booster packs, boxes, ETBs, bundles. The long
// tail of sealed (tins, collections, decks, promos, multi-unit cases) has no
// per-type MSRP worth quoting, so those return null and the UI shows nothing.
// Better a blank than a confident wrong number.
//
// Values are current-era USD retail. Edit them here; they're deliberately in one
// place. They're approximate by nature — a "reference", labelled as such.

export type ProductType =
  | "booster-pack"
  | "booster-box"
  | "elite-trainer-box"
  | "booster-bundle";

// Per game, per format. Absent entries (and games not listed) show no MSRP.
// Pokémon booster box = 36 packs; bundle = 6 packs. One Piece box = 24 packs.
// Riftbound is intentionally omitted: too new for a settled retail price.
const MSRP: Record<string, Partial<Record<ProductType, number>>> = {
  pokemon: {
    "booster-pack": 4.49,
    "booster-box": 161.64,
    "elite-trainer-box": 49.99,
    "booster-bundle": 26.94,
  },
  onepiece: {
    "booster-pack": 4.49,
    "booster-box": 107.76,
  },
};

// The era gate only matters where a format's retail price has drifted over
// time, so it applies per game. Pokémon has 25 years of history and its box
// price has moved a lot, so a Pokémon MSRP is only quoted for current-era sets.
// One Piece (and Riftbound) only exist post-2022 with a single, unchanged retail
// price, so every set is current — no gate, or the whole back catalogue goes
// blank for no reason (Awakening of the New Era, OP-05, was doing exactly that).
const ERA_SENSITIVE_GAMES = new Set(["pokemon"]);

// For an era-sensitive game, a product is current-era when its earliest snapshot
// sits clearly past our ~2024-07-16 data floor. One at the floor could be any
// age, so it stays blank rather than get a price it may predate; a month's
// buffer keeps floor jitter out. (No release date is stored, so the earliest
// snapshot stands in for one — which is why this can't date pre-tracking sets,
// and Pokémon coverage is limited to sets released since we started.)
const MODERN_SINCE = "2024-08-15";

// If a product's all-time low is far above its supposed MSRP, the type/era guess
// is almost certainly wrong (e.g. a vintage box that only entered tracking
// recently, so its earliest snapshot looks modern). Suppress rather than quote a
// retail price it never traded near. A genuinely modern box tracked from release
// floors near retail and passes; one that mooned before we saw it is a blank.
const PLAUSIBLE_MULTIPLE = 5;

/**
 * The standardised format of a sealed product, from its name — or null when it
 * isn't one of the few with a stable MSRP. Multi-unit cases and displays return
 * null on purpose: their contents (and so their retail price) vary.
 */
export function classifyProduct(name: string): ProductType | null {
  const s = name.toLowerCase();
  if (/case|display box|display case|carton/.test(s)) return null; // multi-unit
  // Qualified variants aren't the standard unit the MSRP is for: a "Sleeved"
  // or "Deluxe" pack is a premium single, a "Half" box is half the count, an
  // "Art Bundle" is a collectible set. Priced nothing like the plain format.
  if (/\bhalf\b|sleeved|deluxe|art bundle|art set|\bmini\b|jumbo/.test(s)) {
    return null;
  }
  if (/elite trainer box|\betb\b/.test(s)) return "elite-trainer-box";
  if (/booster bundle/.test(s)) return "booster-bundle";
  if (/booster box/.test(s)) return "booster-box";
  if (/booster pack/.test(s)) return "booster-pack";
  return null;
}

export interface MsrpReference {
  msrp: number;
  type: ProductType;
}

/**
 * A reference MSRP for a sealed product, or null when we can't quote one
 * honestly. Null unless the format is standardised, the game has a curated
 * price, the product dates to the current era, and its history is consistent
 * with that retail price.
 *
 * `earliest` is the earliest snapshot date ("YYYY-MM-DD"), used as a release
 * proxy. `allTimeLow` is the lowest market price ever recorded, the sanity gate.
 * `language` gates to "EN": the table is English retail, and a Japanese box
 * (fewer packs, its own MSRP) trades nothing like it — quoting the English
 * figure read as "-50% vs MSRP" on JP boxes until this was added.
 */
export function msrpFor(opts: {
  game: string;
  name: string;
  language: string;
  earliest: string | null;
  allTimeLow: number | null;
}): MsrpReference | null {
  if (opts.language !== "EN") return null;
  const type = classifyProduct(opts.name);
  if (!type) return null;
  const msrp = MSRP[opts.game]?.[type];
  if (msrp == null) return null;
  if (ERA_SENSITIVE_GAMES.has(opts.game)) {
    if (!opts.earliest || opts.earliest <= MODERN_SINCE) return null;
  }
  if (opts.allTimeLow != null && opts.allTimeLow > msrp * PLAUSIBLE_MULTIPLE) {
    return null;
  }
  return { msrp, type };
}

const TYPE_LABELS: Record<ProductType, string> = {
  "booster-pack": "booster pack",
  "booster-box": "booster box",
  "elite-trainer-box": "Elite Trainer Box",
  "booster-bundle": "booster bundle",
};

/** Plain name of a format, for prose ("...retail for a booster box when new"). */
export function typeLabel(type: ProductType): string {
  return TYPE_LABELS[type];
}

/** The format with its article — "a booster box", "an Elite Trainer Box". */
export function typePhrase(type: ProductType): string {
  const label = TYPE_LABELS[type];
  return `${/^[aeiou]/i.test(label) ? "an" : "a"} ${label}`;
}

/**
 * How the current price compares to MSRP, in a few words. A big gap reads as a
 * multiple ("≈135× MSRP"); a small one as a signed percentage ("+38% vs MSRP",
 * "-12% vs MSRP") since near parity a multiple like "1.4×" is harder to feel.
 */
export function msrpComparison(current: number, msrp: number): string {
  const r = current / msrp;
  if (r >= 1.5) {
    const mult = r < 10 ? r.toFixed(1) : String(Math.round(r));
    return `≈${mult}× MSRP`;
  }
  const pct = Math.round((r - 1) * 100);
  return `${pct >= 0 ? "+" : ""}${pct}% vs MSRP`;
}
