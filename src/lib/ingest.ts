import { getDb } from "@/db";
import { cards, priceSnapshots, type NewCard, type NewPriceSnapshot } from "@/db/schema";
import { sql } from "drizzle-orm";
import { Game } from "./games";
import {
  getGroups,
  getProducts,
  getPrices,
  extractExtended,
  mapPool,
} from "./tcgcsv";
import { isTracked, sanePrice } from "./tracking";

export interface IngestResult {
  game: string;
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
export async function ingestGame(game: Game, date = utcDate()): Promise<IngestResult> {
  const db = getDb();
  const groups = await getGroups(game.categoryId);

  const cardRows: NewCard[] = [];
  const snapRows: NewPriceSnapshot[] = [];
  // Best (highest) sane price seen per product, across its price subtypes.
  const saneByProduct = new Map<number, number>();

  await mapPool(groups, 4, async (group) => {
    const [products, prices] = await Promise.all([
      getProducts(game.categoryId, group.groupId),
      getPrices(game.categoryId, group.groupId),
    ]);

    for (const p of products) {
      const rarity = extractExtended(p, "Rarity");
      const number = extractExtended(p, "Number");
      cardRows.push({
        productId: p.productId,
        game: game.slug,
        categoryId: game.categoryId,
        groupId: group.groupId,
        groupName: group.name,
        name: p.name,
        cleanName: p.cleanName,
        imageUrl: p.imageUrl,
        url: p.url,
        rarity,
        number,
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
        date,
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

  // Upsert cards (metadata can change: new rarity data, renamed presale, etc.)
  for (const batch of chunk(cardRows, 500)) {
    await db
      .insert(cards)
      .values(batch)
      .onConflictDoUpdate({
        target: cards.productId,
        set: {
          groupName: sql`excluded.group_name`,
          name: sql`excluded.name`,
          cleanName: sql`excluded.clean_name`,
          imageUrl: sql`excluded.image_url`,
          url: sql`excluded.url`,
          rarity: sql`excluded.rarity`,
          number: sql`excluded.number`,
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
    date,
    groups: groups.length,
    cards: cardRows.length,
    tracked: trackedIds.size,
    snapshots: validSnaps.length,
  };
}
