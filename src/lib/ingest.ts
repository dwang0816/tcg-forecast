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
  const groups = await getGroups(categoryId);

  const cardRows: NewCard[] = [];
  const snapRows: NewPriceSnapshot[] = [];
  // Best (highest) sane price seen per product, across its price subtypes.
  const saneByProduct = new Map<number, number>();

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
        if (prev == null || sp > prev) saneByProduct.set(pr.productId, sp);
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
  }

  // Fallback images: printings related to this card that have an image, tried
  // by the UI until one loads. Singles group by card number (variants like
  // "(Metal) (Prize Wall)" borrow the base printing's art); sealed products
  // group by set (an image-less "Booster Case" borrows the set's booster box).
  // Ordered by productId so earlier (usually complete) products come first.
  const keyOf = (c: NewCard): string | null => {
    if (c.number) return `n:${c.number}`;
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
          extended: sql`excluded.extended`,
          altImageUrls: sql`excluded.alt_image_urls`,
          isSingle: sql`excluded.is_single`,
          tracked: sql`excluded.tracked`,
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
