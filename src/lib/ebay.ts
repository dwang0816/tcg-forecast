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

/**
 * The same card number, however a seller chose to type it.
 *
 * "004/052", "4/52" and "004 / 052" are one number; leading zeros and spacing are
 * seller noise, not identity. Non-numeric halves are left alone — "065/M-P" and
 * "XY176" mean what they say, and Number("m-p") is nonsense.
 */
function canonNumber(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, "")
    .split("/")
    .map((part) => (/^\d+$/.test(part) ? String(Number(part)) : part))
    .join("/");
}

// Words too common in card titles to prove anything.
const STOP = new Set(["card", "cards", "the", "and"]);

/**
 * Words that must appear in a title for it to be this card, even when every one
 * of them is short.
 *
 * significant() drops anything under four letters as noise, which is right for
 * "Irelia - Blade Dancer" and catastrophic for "Old Rod": it leaves NOTHING, and
 * the caller then skipped the name check entirely, so any listing carrying the
 * right number matched. Old Rod ended up wearing a photo of a Wooloo, and a
 * lookup for it returned a Riftbound card — both titles have 011/024 in them and
 * that was the whole test. 168 cards have names with no word of four letters:
 * Old Rod, Lux, Mew, N, Uta, Leo, even "Red Card" (card is a stop word, red is
 * three letters).
 *
 * So when the strict filter leaves nothing, fall back to the name as it actually
 * is. A short word proves less than a long one, but it proves more than nothing.
 */
function identifyingWords(name: string): string[] {
  const strong = significant(name);
  if (strong.length > 0) return strong;
  return (
    norm(name)
      .split(/\s+/)
      // Must contain a letter or digit. norm() keeps "-" and "/", and baseName
      // leaves the hyphen in "Mew - 2023" behind, so without this the fallback
      // demanded a literal "-" in the title and threw away the correct listing
      // for Tord Reklev's Mew. Punctuation is not a word.
      .filter((w) => /[a-z0-9]/.test(w) && !STOP.has(w) && !/^\d+$/.test(w))
  );
}

/**
 * Is this word in the title, as a word?
 *
 * Substring matching is fine for the long words significant() yields, but lethal
 * for the short ones: "n" is inside half the words in English, and a card called
 * N would match everything. Short words get boundaries.
 */
function containsWord(t: string, w: string): boolean {
  if (w.length >= 4) return t.includes(w);
  const esc = w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t);
}

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

/**
 * Qualifiers that belong to a DIFFERENT printing of this same number.
 *
 * The qualifier check below proves our qualifiers are in the title. It never
 * asked whether the title claims one we DON'T have, so "Irelia - Blade Dancer
 * (Metal)" happily matched "Irelia - Blade Dancer (Metal) (Prize Wall)" — a
 * different card, and a $3,500 one. Ezreal (Metal) at $1,549 wore the Prize
 * Wall's photo, and Azir (Metal) wore it through five human approvals, because
 * the two printings are the same artwork and the eye has nothing to catch.
 *
 * The rivals come from our own catalog rather than a hardcoded list, because a
 * list would be a lie: 551 different qualifiers separate two cards that share a
 * number, and the worst price gaps behind them are "alternate art" ($49,935),
 * "wanted poster" ($49,334) and "sp" ($20,000). Prize Wall isn't even the top
 * twenty. What we know for certain is what OUR OWN siblings are called, so that's
 * what we check.
 *
 * Skips qualifiers under three characters and pure numbers — "sp" and "001" are
 * too common in listing titles to reject on, and a false rejection costs a photo.
 *
 * Also skips a sibling qualifier that IS the card's number. One Piece names a
 * printing "Roronoa Zoro (EB04-007)" and its sibling "Roronoa Zoro (SP)", so the
 * number arrives here dressed as a qualifier — and every honest title for either
 * card carries it, because it's the anchor we searched on. A card's own number
 * can't be evidence against it.
 */
function rivalQualifiers(
  name: string,
  number: string | null,
  siblingNames: string[] | null | undefined,
): string[] {
  if (!siblingNames?.length) return [];
  const ours = new Set(qualifiers(name).map((q) => norm(q).trim()));
  const num = number ? canonNumber(norm(number).trim()) : null;
  const theirs = siblingNames.flatMap((n) => qualifiers(n)).map((q) => norm(q).trim());
  return [
    ...new Set(
      theirs.filter(
        (q) =>
          q.length >= 3 &&
          !/^\d+$/.test(q) &&
          !ours.has(q) &&
          (num === null || canonNumber(q) !== num),
      ),
    ),
  ];
}

/**
 * Is this phrase in the title as whole words?
 *
 * Substring matching here rejected a real photo: "Champions Festival ... World
 * Championships 2019" was thrown out because a sibling is tagged [Champion] and
 * "champion" is inside "championships". A rival qualifier is only evidence when
 * the title actually says it.
 */
function hasPhrase(t: string, phrase: string): boolean {
  const esc = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^a-z0-9])${esc}([^a-z0-9]|$)`).test(t);
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
    /**
     * Names of the OTHER cards in our catalog carrying this same number — the
     * rival printings. Their qualifiers are what a title must not claim. Callers
     * compute this; omitting it silently disables the check, which is why every
     * caller passes it.
     */
    siblingNames?: string[] | null;
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

  // The number must appear — BOTH halves of it.
  //
  // This used to anchor on the numerator and accept any denominator, so a title
  // for 004/029 satisfied a request for 004/052: a different card, from a
  // different set, that happens to be the same Pokémon. Three of those got
  // through and two were approved, because at a glance they look right.
  //
  // The tolerance that fallback was reaching for is real — sellers write
  // "004 / 052" and "4/52" — so it's kept, by comparing canonically instead of
  // textually. What's dropped is the pretence that the denominator is optional.
  const num = card.number.trim().toLowerCase();
  const wanted = canonNumber(num);
  const hasNumber =
    t.includes(num) ||
    [...t.matchAll(/(\d+)\s*\/\s*([0-9a-z-]+)/g)].some(
      (m) => canonNumber(`${m[1]}/${m[2]}`) === wanted,
    );
  if (!hasNumber) return false;

  // EVERY word of the base name, not just one. "Jhin" alone let a listing for a
  // different Jhin card through.
  //
  // identifyingWords, not significant: a name made entirely of short words —
  // "Old Rod", "Lux", "N" — left significant() empty, and `base.length > 0`
  // then skipped this check altogether. The number was the only test those cards
  // ever got, so Old Rod wore a photo of a Wooloo.
  const base = identifyingWords(baseName(card.name));
  if (base.length > 0 && !base.every((w) => containsWord(t, w))) return false;

  // And every variant qualifier must be accounted for. This is the important
  // one: the number identifies the CARD but not the PRINTING. Jhin - Virtuoso
  // (Metal) (Prize Card) is $1,300 and shares 181/219 with the ordinary foil,
  // which sells for a fraction — and eBay is full of the foil. Without this the
  // expensive card wears the cheap card's photo and nothing on screen says so.
  for (const q of qualifiers(card.name)) {
    const qw = significant(q);
    if (qw.length > 0 && !qw.some((w) => t.includes(w))) return false;
  }

  // And the title must not claim a printing we are NOT. The check above only
  // proves our qualifiers are present; a title carrying ours PLUS another card's
  // still passed it, which is how the plain (Metal) cards ended up wearing the
  // (Prize Wall) photo.
  for (const q of rivalQualifiers(card.name, card.number, card.siblingNames)) {
    if (hasPhrase(t, q)) return false;
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
export interface CardQuery {
  name: string;
  number: string | null;
  groupName: string;
  language: string;
  game: string;
  /** See matchesCard(): does name+number identify one printing, or several? */
  ambiguous: boolean;
  /** See matchesCard(): names of other cards sharing this number. */
  siblingNames?: string[] | null;
  /**
   * Image URLs a human rejected in /admin/photos. Skipping these is what stops
   * a rerun rediscovering the same listing and quietly putting the same bad
   * picture back — undoing the review.
   */
  rejectedPhotoUrls?: string[] | null;
}

/**
 * The two searches to run, narrow first, each with the row count it needs.
 *
 * Two queries because the query's job is RECALL and matchesCard's job is
 * PRECISION — and conflating them cost us the most valuable cards on the site.
 *
 * eBay ANDs every word. The narrow query piles on the set name, the variant
 * qualifiers and the language, and for
 * "Irelia - Blade Dancer (Metal) (Prize Wall) 195/221" that returns ZERO results
 * — while "irelia blade dancer 195/221" returns 142, the first page of which
 * contains the exact card. The card was always on eBay; the query was simply too
 * specific to find it.
 *
 * Narrow first because it ranks the right printing highest when it works; broad
 * as the fallback. Both feed the same strict matcher, so widening the net can't
 * loosen what we accept — only what we get to consider.
 */
function queriesFor(card: CardQuery): [string, number][] {
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
  // The wider net needs more rows, since the right one ranks lower in it.
  return [
    [narrow, 10],
    [broad, 25],
  ];
}

export async function findListingPhoto(
  token: string,
  card: CardQuery,
): Promise<ListingPhoto | null> {
  if (!card.number) return null;
  const rejected = new Set(card.rejectedPhotoUrls ?? []);
  for (const [q, limit] of queriesFor(card)) {
    const hit = await searchOnce(token, q, limit, card, rejected);
    if (hit) return hit;
  }
  return null;
}

/**
 * Every listing we'd accept for this card, de-duplicated, best-ranked first.
 *
 * This is the reroll's view of the world. It deliberately does NOT skip the
 * rejected list: the reroll is a human flicking through what's out there, and a
 * picture you passed on five minutes ago is one you may want back — you might
 * have been wrong. rejectedPhotoUrls exists to stop the unattended photo job
 * resurrecting a rejection; it was never meant to stop a person looking.
 *
 * Both queries always run, unlike findListingPhoto's short-circuit: you can't
 * cycle through a list you stopped building at the first hit.
 */
export async function findListingPhotos(
  token: string,
  card: CardQuery,
): Promise<ListingPhoto[]> {
  if (!card.number) return [];
  const seen = new Map<string, ListingPhoto>();
  for (const [q, limit] of queriesFor(card)) {
    for (const p of await searchAll(token, q, limit, card)) {
      if (!seen.has(p.imageUrl)) seen.set(p.imageUrl, p);
    }
  }
  return [...seen.values()];
}

/** One Browse search, returning the first result our matcher accepts. */
/** Every listing on this page of results that the matcher accepts, in eBay's order. */
async function searchAll(
  token: string,
  q: string,
  limit: number,
  card: Parameters<typeof matchesCard>[1],
): Promise<ListingPhoto[]> {
  const url =
    `${BROWSE}?q=${encodeURIComponent(q)}&limit=${limit}` +
    `&filter=${encodeURIComponent("buyingOptions:{FIXED_PRICE|AUCTION}")}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID": "EBAY_US",
    },
  });
  if (!res.ok) return [];

  const j = (await res.json()) as {
    itemSummaries?: {
      title: string;
      image?: { imageUrl?: string };
      itemWebUrl?: string;
      price?: { value?: string; currency?: string };
    }[];
  };

  const out: ListingPhoto[] = [];
  for (const it of j.itemSummaries ?? []) {
    if (!it.image?.imageUrl || !it.itemWebUrl) continue;
    if (!matchesCard(it.title, card)) continue; // card carries groupName+game
    out.push({
      imageUrl: it.image.imageUrl,
      listingUrl: it.itemWebUrl,
      title: it.title,
      price: it.price?.value ? Number(it.price.value) : null,
      currency: it.price?.currency ?? null,
    });
  }
  return out;
}

async function searchOnce(
  token: string,
  q: string,
  limit: number,
  card: Parameters<typeof matchesCard>[1],
  rejected: Set<string>,
): Promise<ListingPhoto | null> {
  const all = await searchAll(token, q, limit, card);
  // A human already said no to these.
  return all.find((p) => !rejected.has(p.imageUrl)) ?? null;
}
