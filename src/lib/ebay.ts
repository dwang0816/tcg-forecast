/**
 * eBay Browse API — used to find a photo of a card TCGplayer has no art for.
 *
 * Roughly 3% of tracked cards have no picture from any source: whole old
 * Japanese sets (HeartGold/SoulSilver 2010, Ultra Sun/Moon deck boxes) that
 * TCGplayer simply never photographed. Verified their CDN 403s for those
 * products while returning real scans for everything else, so the gap is real
 * and no amount of re-checking fills it.
 *
 * What we take is a LISTING, not an image: the photo belongs to the seller, so
 * we store the URL and show it captioned as a live listing with a link to it,
 * never copying the file. That keeps us inside what the Browse API is for, and
 * it makes a bad match read as a questionable listing rather than as us being
 * wrong about the card.
 *
 * Matching is deliberately strict — see matchesCard(). We very recently had 2,543
 * cards displaying a different card's art, and the cards this touches are the
 * valuable ones. A missing picture is recoverable; a confident wrong one isn't,
 * because nobody can tell it's wrong.
 */

export interface ListingPhoto {
  imageUrl: string;
  listingUrl: string;
  title: string;
  price: number | null;
  currency: string | null;
}

const GAME_WORD: Record<string, string> = {
  pokemon: "pokemon",
  onepiece: "one piece",
  riftbound: "riftbound",
};

const OAUTH = "https://api.ebay.com/identity/v1/oauth2/token";
const BROWSE = "https://api.ebay.com/buy/browse/v1/item_summary/search";

let cachedToken: { value: string; expires: number } | null = null;

/** Client-credentials token, reused until shortly before it expires. */
/**
 * Are the credentials present at all?
 *
 * Separate from ebayToken() because "nobody configured this" and "eBay said no"
 * need different answers, and a null token can't tell them apart. Conflating them
 * cost a real debugging session: the server logged "credentials are missing" while
 * both variables were sitting right there in the environment.
 */
export function ebayConfigured(): boolean {
  return Boolean(process.env.EBAY_CLIENT_ID && process.env.EBAY_CLIENT_SECRET);
}

export async function ebayToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedToken.expires) return cachedToken.value;
  const id = process.env.EBAY_CLIENT_ID;
  const secret = process.env.EBAY_CLIENT_SECRET;
  if (!id || !secret) return null;

  const res = await fetch(OAUTH, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: "Basic " + Buffer.from(`${id}:${secret}`).toString("base64"),
    },
    body:
      "grant_type=client_credentials&scope=" +
      encodeURIComponent("https://api.ebay.com/oauth/api_scope"),
  });
  if (!res.ok) {
    // Say so loudly. A silent null here reads downstream as "not configured",
    // which sends whoever is debugging to check environment variables that were
    // never the problem. 401 means the id/secret are set but wrong — a stray
    // newline from a shell pipe does exactly this.
    console.error(
      `[ebay] OAuth refused the credentials: ${res.status} ${res.statusText}. ` +
        `EBAY_CLIENT_ID is set (${id.length} chars) and EBAY_CLIENT_SECRET is set ` +
        `(${secret.length} chars), so they are present but not accepted.`,
    );
    return null;
  }
  const j = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    value: j.access_token,
    expires: Date.now() + (j.expires_in - 60) * 1000,
  };
  return j.access_token;
}

/**
 * Titles that describe something other than the single card we asked for.
 *
 * A slab photo is a picture of a plastic case; a lot is a picture of a pile.
 * Both are honest listings and useless as card art, so they're skipped rather
 * than shown.
 */
const REJECT = [
  /\bPSA\s*\d/i,
  /\bBGS\s*\d/i,
  /\bCGC\s*\d/i,
  /\bACE\s*\d/i,
  /\bgraded\b/i,
  /\bslab\b/i,
  /\blot\b/i,
  /\bbundle\b/i,
  /\bplayset\b/i,
  /\bsealed\b/i,
  /\bbooster\b/i,
  /\bpack\b/i,
  /\bbox\b/i,
  /\bproxy\b/i,
  /\bcustom\b/i,
  /\bfan\s*made\b/i,
  /\bmetal\b/i,
  /\bsticker\b/i,
  /\bjumbo\b/i,
  /\bplaymat\b/i,
  /\bbinder\b/i,
  /\bchoose\b/i,
  /\byou\s*pick\b/i,
  /\bx\s*[2-9]\b/i,
  /\b[2-9]\s*x\b/i,
];

/** Normalise for comparison: lowercase, strip punctuation runs. */
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9/\- ]+/g, " ");

// Words too common in card titles to prove anything.
const STOP = new Set(["card", "cards", "the", "and"]);

const significant = (s: string) =>
  norm(s)
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w));

/** The card's name without its variant qualifiers or its number. */
function baseName(name: string): string {
  return name
    .replace(/\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\b[\w]+\/[\w]+\b/g, " ");
}

/** The parenthesised/bracketed qualifiers: "(Metal)", "(Alternate Art)", "[Staff]". */
function qualifiers(name: string): string[] {
  return [
    ...[...name.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]),
    ...[...name.matchAll(/\[([^\]]+)\]/g)].map((m) => m[1]),
  ];
}

/**
 * Would this listing's title convince a person it's the card we asked for?
 *
 * The card NUMBER is the anchor — "014/070" is specific enough that a title
 * carrying it is almost certainly that card, where a name alone ("Arcanine")
 * matches hundreds of printings. Cards without a number aren't attempted at all;
 * there's nothing to anchor on and a guess is how you end up showing a Burmy.
 */
export function matchesCard(
  title: string,
  card: {
    name: string;
    number: string | null;
    groupName?: string;
    game?: string;
    /**
     * True when another card in our own catalog shares this name AND number —
     * i.e. name+number does not identify a single printing. Callers must compute
     * this; defaulting it to true would silently make the set check mandatory
     * again, which is the safe direction to fail.
     */
    ambiguous?: boolean;
  },
): boolean {
  if (!card.number) return false;
  const t = norm(title);

  // A reject rule must not fire on something the card genuinely IS. Riftbound
  // sells real "(Metal)" cards — Jhin - Virtuoso (Metal) — and the /metal/ rule
  // (meant for novelty fakes) was throwing away every correct listing for the
  // most valuable cards we have. If it's in the card's own name, it's not a
  // disqualifier, it's the card.
  const applicable = REJECT.filter((re) => !re.test(card.name));
  if (applicable.some((re) => re.test(title))) return false;

  // The number must appear. Accept "014/070" and the bare "014" form sellers use.
  const num = card.number.trim().toLowerCase();
  const bare = num.split("/")[0];
  const hasNumber =
    t.includes(num) ||
    new RegExp(`\\b${bare.replace(/[^a-z0-9]/g, "")}\\s*/\\s*\\d+`).test(t);
  if (!hasNumber) return false;

  // EVERY significant word of the base name, not just one. "Jhin" alone let a
  // listing for a different Jhin card through.
  const base = significant(baseName(card.name));
  if (base.length > 0 && !base.every((w) => t.includes(w))) return false;

  // And every variant qualifier must be accounted for. This is the important
  // one: the number identifies the CARD but not the PRINTING. Jhin - Virtuoso
  // (Metal) (Prize Card) is $1,300 and shares 181/219 with the ordinary foil,
  // which sells for a fraction — and eBay is full of the foil. Without this the
  // expensive card wears the cheap card's photo and nothing on screen says so.
  for (const q of qualifiers(card.name)) {
    const qw = significant(q);
    if (qw.length > 0 && !qw.some((w) => t.includes(w))) return false;
  }

  // And where it's needed, the SET has to be recognisable in the title.
  //
  // Card numbers are only unique within a set, and promos reuse the base set's
  // numbers wholesale: our "Jinx - Rebel 202/298 (Organized Play Promotional
  // Cards)" matched a listing for "Jinx Rebel 202/298 Riftbound Origins" — same
  // name, same number, different printing. Without this the promo wears the base
  // card's photo.
  //
  // But it only guards against a collision that exists. When our own catalog holds
  // exactly ONE card with this name and number, a title carrying both cannot be
  // any other card, and demanding the set name too just rejects sellers who didn't
  // type it. That was costing real coverage — 226 of 261 blank cards are
  // unambiguous, and Riftbound's hit rate was 4% because its promo sets are rarely
  // named in titles. So the check applies only where ambiguity is real.
  //
  // The game word is excluded because it's in every title ("Riftbound" appears
  // in all of them and proves nothing), and so are words already in the card's
  // name, which would let the set check pass on the card name alone.
  if (card.ambiguous && card.groupName) {
    const nameWords = new Set([
      ...significant(baseName(card.name)),
      ...qualifiers(card.name).flatMap(significant),
    ]);
    const gameWords = new Set(significant(GAME_WORD[card.game ?? ""] ?? ""));
    const setWords = significant(
      card.groupName.replace(/^[A-Za-z0-9]+:\s*/, ""),
    ).filter((w) => !nameWords.has(w) && !gameWords.has(w));
    if (setWords.length > 0 && !setWords.some((w) => t.includes(w))) return false;
  }
  return true;
}

/**
 * Best live listing photo for a card, or null.
 *
 * Queries by number + name + set, which is how the sellers themselves title
 * these ("Arcanine 014/070 Holo Rare HeartGold Collection L1 2009 Pokemon").
 */
export async function findListingPhoto(
  token: string,
  card: {
    name: string;
    number: string | null;
    groupName: string;
    language: string;
    game: string;
    /** See matchesCard(): does name+number identify one printing, or several? */
    ambiguous: boolean;
    /**
     * Image URLs a human rejected in /admin/photos. Skipping these is what stops
     * a rerun rediscovering the same listing and quietly putting the same bad
     * picture back — undoing the review.
     */
    rejectedPhotoUrls?: string[] | null;
  },
): Promise<ListingPhoto | null> {
  if (!card.number) return null;

  // Two queries, narrow then broad, because the query's job is RECALL and
  // matchesCard's job is PRECISION — and conflating them cost us the most
  // valuable cards on the site.
  //
  // eBay ANDs every word. The narrow query below piles on the set name, the
  // variant qualifiers and the language, and for
  // "Irelia - Blade Dancer (Metal) (Prize Wall) 195/221" that returns ZERO
  // results — while "irelia blade dancer 195/221" returns 142, the first page of
  // which contains the exact card. The card was always on eBay; the query was
  // simply too specific to find it.
  //
  // So: try narrow first (it ranks the right printing highest when it works),
  // then fall back to name + number alone. Both feed the same strict matcher, so
  // widening the net can't loosen what we accept — only what we get to consider.
  const set = card.groupName.replace(/^[A-Za-z0-9]+:\s*/, "").trim();
  const nameWords = significant(baseName(card.name));
  const narrow = [
    ...new Set([
      ...nameWords,
      ...qualifiers(card.name).flatMap(significant),
      card.number,
      GAME_WORD[card.game] ?? "",
      ...significant(set),
      card.language === "JP" ? "japanese" : "",
    ]),
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
  const broad = [...new Set([...nameWords, card.number])].filter(Boolean).join(" ").trim();

  const rejected = new Set(card.rejectedPhotoUrls ?? []);
  for (const [q, limit] of [
    [narrow, 10],
    [broad, 25], // wider net needs more rows, since the right one ranks lower
  ] as [string, number][]) {
    const hit = await searchOnce(token, q, limit, card, rejected);
    if (hit) return hit;
    if (q === broad) break;
  }
  return null;
}

/** One Browse search, returning the first result our matcher accepts. */
async function searchOnce(
  token: string,
  q: string,
  limit: number,
  card: Parameters<typeof matchesCard>[1],
  rejected: Set<string>,
): Promise<ListingPhoto | null> {
  const url =
    `${BROWSE}?q=${encodeURIComponent(q)}&limit=${limit}` +
    `&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE|AUCTION}")}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!res.ok) return null;

  const j = (await res.json()) as {
    itemSummaries?: {
      title: string;
      image?: { imageUrl?: string };
      itemWebUrl?: string;
      price?: { value?: string; currency?: string };
    }[];
  };

  for (const it of j.itemSummaries ?? []) {
    if (!it.image?.imageUrl || !it.itemWebUrl) continue;
    if (rejected.has(it.image.imageUrl)) continue; // a human already said no
    if (!matchesCard(it.title, card)) continue; // card carries groupName+game
    return {
      imageUrl: it.image.imageUrl,
      listingUrl: it.itemWebUrl,
      title: it.title,
      price: it.price?.value ? Number(it.price.value) : null,
      currency: it.price?.currency ?? null,
    };
  }
  return null;
}
