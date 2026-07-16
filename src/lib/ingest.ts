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

export interface IngestResult {
  game: string;
  date: string;
  groups: number;
  cards: number;
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

  await mapPool(groups, 4, async (group) => {
    const [products, prices] = await Promise.all([
      getProducts(game.categoryId, group.groupId),
      getPrices(game.categoryId, group.groupId),
    ]);

    for (const p of products) {
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
        rarity: extractExtended(p, "Rarity"),
        number: extractExtended(p, "Number"),
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
          updatedAt: sql`now()`,
        },
      });
  }

  // Insert today's snapshots; ignore if this day was already ingested. Only
  // insert snapshots for products we actually have a card row for.
  const knownIds = new Set(cardRows.map((c) => c.productId));
  const validSnaps = snapRows.filter((s) => knownIds.has(s.productId));
  for (const batch of chunk(validSnaps, 500)) {
    await db.insert(priceSnapshots).values(batch).onConflictDoNothing();
  }

  return {
    game: game.slug,
    date,
    groups: groups.length,
    cards: cardRows.length,
    snapshots: validSnaps.length,
  };
}
