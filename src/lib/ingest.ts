import { getDb } from "@/db";
import { cards, priceSnapshots, type NewCard, type NewPriceSnapshot } from "@/db/schema";
import { sql } from "drizzle-orm";
import { Game, Language, categoryFor } from "./games";
import {
  getGroups,
  getProducts,
  getPrices,
  getLastUpdated,
  extractExtended,
  mapPool,
} from "./tcgcsv";
import { isTracked, sanePrice } from "./tracking";

export interface IngestResult {
  game: string;
  language: Language;
  date: string;
  groups: number;
  cards: number;
  tracked: number;
  snapshots: number;
  /** True when we already held this day and didn't re-pull tcgcsv. */
  skipped?: boolean;
}

/** Today's date in UTC as "YYYY-MM-DD". */
export function utcDate(d = new Date()): string {
  return d.toISOString().slice(0, 10);
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Do we already hold a COMPLETE day for this game at this date?
 *
 * We run 6x/day to reliably catch tcgcsv's single ~20:00 UTC refresh, but their
 * docs ask for one pull per 24 hours ("There is no benefit to polling the files
 * more frequently"). Five of those six runs re-fetch the whole catalog and write
 * back byte-identical rows. This lets those five cost one tiny request instead,
 * while the run that finds new data still does the real work.
 *
 * "Complete" is measured against the previous stored day's row count rather than
 * mere existence, because a run that died midway through the snapshot batches
 * would otherwise look done forever and leave that day permanently short. The
 * count moves a little day to day as cards enter and leave the tracked set, so
 * 90% is the tolerance. Without a bookkeeping table this is the only completeness
 * signal available.
 */
async function haveCompleteDay(
  game: string,
  language: Language,
  date: string,
): Promise<boolean> {
  const db = getDb();
  // Bounded to two dates so this stays an index scan, not a walk of the whole
  // multi-million-row history.
  const res = await db.execute(sql`
    WITH prev AS (
      SELECT max(s.date) AS d
      FROM price_snapshots s
      JOIN cards c ON c.product_id = s.product_id
      WHERE c.game = ${game} AND c.language = ${language} AND s.date < ${date}
    )
    SELECT
      count(*) FILTER (WHERE s.date = ${date})::int AS today,
      count(*) FILTER (WHERE s.date = (SELECT d FROM prev))::int AS prev_n
    FROM price_snapshots s
    JOIN cards c ON c.product_id = s.product_id
    WHERE c.game = ${game}
      AND c.language = ${language}
      AND s.date IN (${date}, COALESCE((SELECT d FROM prev), ${date}))
  `);
  const row = (res as unknown as { rows?: { today: number; prev_n: number }[] })
    .rows?.[0];
  if (!row || row.today === 0) return false;
  if (!row.prev_n) return true; // first day we've ever stored — nothing to compare
  return row.today >= row.prev_n * 0.9;
}

// Sealed products (boxes, packs, decks, etc.) never carry a card rarity/number.
// This keyword guard also catches the rare sealed item tagged with stray data.
const SEALED_RE =
  /\b(booster|box|display|case|pack|bundle|collection|tin|blister|elite trainer|build\s*&\s*battle|starter|precon|gift set|premium collection|treasure chest|deck box|sleeved|carton)\b/i;

/** A product is a "single" (individual card) if it has card data and isn't sealed. */
export function classifyIsSingle(
  name: string,
  rarity: string | null,
  number: string | null,
): boolean {
  if (SEALED_RE.test(name)) return false;
  return rarity != null || number != null;
}

/**
 * Ingest one game's entire catalog + current prices, writing a snapshot dated
 * `date`. Safe to re-run: cards are upserted, snapshots are inserted once per
 * (product, subtype, date).
 */
export async function ingestGame(
  game: Game,
  language: Language = "EN",
  date?: string,
  opts: { force?: boolean } = {},
): Promise<IngestResult> {
  const db = getDb();
  const categoryId = categoryFor(game, language);
  if (categoryId == null) {
    throw new Error(`${game.slug} has no ${language} catalog on TCGplayer`);
  }
  // Date the snapshot by when tcgcsv published the data, NOT by when we ran.
  // We ingest 6x/day but tcgcsv refreshes once (~20:00 UTC), so runs before the
  // refresh return the previous day's prices — stamping those with today's date
  // would create a duplicate phantom day and break movers. Fall back to our own
  // UTC date only if tcgcsv doesn't tell us.
  const snapshotDate = date ?? (await getLastUpdated()) ?? utcDate();

  // Bail before touching tcgcsv's catalog if this day is already banked. This is
  // the whole saving: last-updated.txt is a few bytes, the catalog is thousands
  // of products across hundreds of groups.
  if (!opts.force && (await haveCompleteDay(game.slug, language, snapshotDate))) {
    return {
      game: game.slug,
      language,
      date: snapshotDate,
      groups: 0,
      cards: 0,
      tracked: 0,
      snapshots: 0,
      skipped: true,
    };
  }

  const groups = await getGroups(categoryId);

  const cardRows: NewCard[] = [];
  const snapRows: NewPriceSnapshot[] = [];
  // Best (highest) sane price seen per product, across its price subtypes —
  // plus the row it came from, so every card can carry a current price.
  const saneByProduct = new Map<number, number>();
  const bestRowByProduct = new Map<
    number,
    { market: number | null; listing: number | null; low: number | null; high: number | null }
  >();

  await mapPool(groups, 4, async (group) => {
    const [products, prices] = await Promise.all([
      getProducts(categoryId, group.groupId),
      getPrices(categoryId, group.groupId),
    ]);

    for (const p of products) {
      const rarity = extractExtended(p, "Rarity");
      const number = extractExtended(p, "Number");
      cardRows.push({
        productId: p.productId,
        game: game.slug,
        categoryId,
        language,
        groupId: group.groupId,
        groupName: group.name,
        name: p.name,
        cleanName: p.cleanName,
        // Condition (runs every cron ingest): imageCount === 0 means TCGplayer
        // has no image for this product (it 403s), so drop the broken URL and
        // let the sibling/placeholder fallbacks take over.
        imageUrl: p.imageCount > 0 ? p.imageUrl : null,
        url: p.url,
        rarity,
        number,
        // Keep everything else TCGplayer gives us — it's free (same payload) and
        // powers the card detail page.
        extended: (p.extendedData ?? []).filter(
          (d) => d.name !== "Rarity" && d.name !== "Number",
        ),
        isSingle: classifyIsSingle(p.name, rarity, number),
      });
    }

    for (const pr of prices) {
      // Skip rows with no usable price signal at all.
      if (
        pr.marketPrice == null &&
        pr.lowPrice == null &&
        pr.midPrice == null &&
        pr.highPrice == null
      ) {
        continue;
      }
      const sp = sanePrice(pr);
      if (sp != null) {
        const prev = saneByProduct.get(pr.productId);
        if (prev == null || sp > prev) {
          saneByProduct.set(pr.productId, sp);
          bestRowByProduct.set(pr.productId, {
            market: pr.marketPrice,
            listing: pr.midPrice ?? pr.lowPrice ?? pr.highPrice,
            low: pr.lowPrice,
            high: pr.highPrice,
          });
        }
      }

      snapRows.push({
        productId: pr.productId,
        subTypeName: pr.subTypeName || "Normal",
        date: snapshotDate,
        marketPrice: pr.marketPrice,
        lowPrice: pr.lowPrice,
        midPrice: pr.midPrice,
        highPrice: pr.highPrice,
        directLowPrice: pr.directLowPrice,
      });
    }
  });

  // Decide which cards are worth tracking, and keep only their snapshots.
  const trackedIds = new Set<number>();
  for (const c of cardRows) {
    const keep = isTracked({
      game: game.slug,
      rarity: c.rarity ?? null,
      sanePrice: saneByProduct.get(c.productId) ?? null,
    });
    c.tracked = keep;
    if (keep) trackedIds.add(c.productId);

    // Current price on EVERY card, so search can show one for all 71k.
    const best = bestRowByProduct.get(c.productId);
    if (best) {
      c.marketPrice = best.market;
      c.listingPrice = best.listing;
      c.lowPrice = best.low;
      c.highPrice = best.high;
      c.priceDate = snapshotDate;
    }
  }

  // Fallback images: printings related to this card that have an image, tried
  // by the UI until one loads. Singles group by card number (variants like
  // "(Metal) (Prize Wall)" borrow the base printing's art); sealed products
  // group by set (an image-less "Booster Case" borrows the set's booster box).
  // Ordered by productId so earlier (usually complete) products come first.
  /**
   * The set's own code — OP05, EB01, ST26 — worked out from the singles in it.
   *
   * TCGplayer doesn't give us one, but its singles carry it: every card in
   * "Awakening of the New Era" is numbered OP05-xxx. Sealed products have no
   * number at all, so a booster box otherwise never says OP05 anywhere — and that
   * code is the first thing a One Piece buyer looks for.
   *
   * The threshold is the whole point. Real sets are near-unanimous: Romance Dawn
   * is 100% OP01, Awakening 95% OP05. Reprint sets are not — "Premium Booster
   * -The Best-" draws from OP01 through OP09 and its most common prefix is OP05
   * with 21% of the set. Stamping OP05 on that box would be a confident lie, so
   * anything short of a real majority gets no code at all.
   *
   * Games whose numbers carry no code (Pokémon's "105/112", Riftbound's
   * "181/219") simply never match, and get null — which is correct, they have no
   * such code to show.
   */
  const SET_CODE_DOMINANCE = 0.6;
  const codeOf = (n: string | null | undefined) =>
    n?.match(/^([A-Za-z]{2,4}\d{2})-/)?.[1]?.toUpperCase() ?? null;

  const codeTally = new Map<number, Map<string, number>>();
  for (const c of cardRows) {
    if (!c.isSingle) continue;
    const code = codeOf(c.number);
    if (!code) continue;
    const tally = codeTally.get(c.groupId) ?? new Map<string, number>();
    tally.set(code, (tally.get(code) ?? 0) + 1);
    codeTally.set(c.groupId, tally);
  }
  const setCodeByGroup = new Map<number, string>();
  for (const [groupId, tally] of codeTally) {
    let best: string | null = null;
    let bestN = 0;
    let total = 0;
    for (const [code, n] of tally) {
      total += n;
      if (n > bestN) {
        best = code;
        bestN = n;
      }
    }
    if (best && total > 0 && bestN / total >= SET_CODE_DOMINANCE) {
      setCodeByGroup.set(groupId, best);
    }
  }
  for (const c of cardRows) {
    c.setCode = setCodeByGroup.get(c.groupId) ?? null;
  }

  /**
   * Who may lend a picture to whom.
   *
   * Scoped to the SET, not just the number. Card numbers are only unique within
   * a set — "001/012" exists in dozens of them — so keying on the number alone
   * let a card borrow art from an unrelated card that happened to share it.
   * Blaziken 001/012 (Master Kit) was showing a picture of Burmy 001/012 (PtM:
   * Mewtwo LV.X Collection Pack). 2,543 cards were doing this. A confidently
   * wrong picture is worse than no picture: nobody can tell it's wrong.
   *
   * Same set + same number is the real sibling relationship — the separate
   * product entries TCGplayer creates for one card's variants.
   */
  const keyOf = (c: NewCard): string | null => {
    if (c.number) return `n:${c.groupId}:${c.number}`;
    if (!c.isSingle) return `g:${c.groupId}`;
    return null; // single without a number: nothing reliable to borrow
  };
  const byKey = new Map<string, string[]>();
  const sorted = [...cardRows].sort((a, b) => a.productId - b.productId);
  for (const c of sorted) {
    const k = keyOf(c);
    if (!k || !c.imageUrl) continue;
    const list = byKey.get(k) ?? [];
    if (!list.includes(c.imageUrl)) list.push(c.imageUrl);
    byKey.set(k, list);
  }
  for (const c of cardRows) {
    const k = keyOf(c);
    if (!k) continue;
    const siblings = (byKey.get(k) ?? [])
      .filter((u) => u !== c.imageUrl)
      .slice(0, 5);
    c.altImageUrls = siblings.length ? siblings : null;
  }

  // Upsert cards (metadata can change: new rarity data, renamed presale, etc.)
  for (const batch of chunk(cardRows, 500)) {
    await db
      .insert(cards)
      .values(batch)
      .onConflictDoUpdate({
        target: cards.productId,
        set: {
          language: sql`excluded.language`,
          categoryId: sql`excluded.category_id`,
          groupName: sql`excluded.group_name`,
          name: sql`excluded.name`,
          cleanName: sql`excluded.clean_name`,
          imageUrl: sql`excluded.image_url`,
          url: sql`excluded.url`,
          rarity: sql`excluded.rarity`,
          number: sql`excluded.number`,
          setCode: sql`excluded.set_code`,
          extended: sql`excluded.extended`,
          altImageUrls: sql`excluded.alt_image_urls`,
          isSingle: sql`excluded.is_single`,
          tracked: sql`excluded.tracked`,
          marketPrice: sql`excluded.market_price`,
          listingPrice: sql`excluded.listing_price`,
          lowPrice: sql`excluded.low_price`,
          highPrice: sql`excluded.high_price`,
          priceDate: sql`excluded.price_date`,
          updatedAt: sql`now()`,
        },
      });
  }

  // Upsert today's snapshots. Because we ingest several times a day (see the
  // GitHub Actions schedule) and tcgcsv refreshes once daily, a later run that
  // sees fresher prices overwrites the day's row. Only snapshot products we
  // actually have a card row for.
  // Only snapshot prices for tracked (valuable) cards.
  const validSnaps = snapRows.filter((s) => trackedIds.has(s.productId));
  for (const batch of chunk(validSnaps, 500)) {
    await db
      .insert(priceSnapshots)
      .values(batch)
      .onConflictDoUpdate({
        target: [
          priceSnapshots.productId,
          priceSnapshots.subTypeName,
          priceSnapshots.date,
        ],
        set: {
          marketPrice: sql`excluded.market_price`,
          lowPrice: sql`excluded.low_price`,
          midPrice: sql`excluded.mid_price`,
          highPrice: sql`excluded.high_price`,
          directLowPrice: sql`excluded.direct_low_price`,
        },
      });
  }

  return {
    game: game.slug,
    language,
    date: snapshotDate,
    groups: groups.length,
    cards: cardRows.length,
    tracked: trackedIds.size,
    snapshots: validSnaps.length,
  };
}
