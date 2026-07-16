import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { GameSlug } from "./games";

export type Direction = "gainers" | "losers";
export type Kind = "single" | "sealed";

export interface MoverRow {
  game: string;
  productId: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  url: string | null;
  rarity: string | null;
  number: string | null;
  subTypeName: string;
  curPrice: number;
  prevPrice: number;
  prevDate: string;
  latestDate: string;
  absChange: number;
  pctChange: number;
}

export interface ValuableRow {
  game: string;
  productId: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  url: string | null;
  rarity: string | null;
  number: string | null;
  subTypeName: string;
  /** TCGplayer market price (sales-based). Null when TCGplayer has none. */
  marketPrice: number | null;
  /** TCGplayer average listing price (mid, then low/high), ignoring junk sentinels. */
  listingPrice: number | null;
  // eBay fields intentionally omitted until a sold-data source is wired.
}

// Drizzle's neon-http driver returns results on `.rows`.
function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (Array.isArray(res) ? (res as T[]) : r.rows) ?? [];
}

/**
 * Top price movers over roughly `windowDays`.
 * - `game` omitted  -> across all games (used by the cross-game Products view).
 * - `kind`          -> "single" (individual cards) or "sealed" (boxes/packs).
 * If we lack `windowDays` of history it compares against the oldest snapshot we
 * have and reports the real `prevDate`, so the UI can label the true period.
 * `minPrice` filters out cheap items whose percentage swings are just noise.
 */
export async function getMovers({
  game,
  kind,
  windowDays,
  direction,
  limit = 20,
  minPrice = 2,
}: {
  game?: GameSlug;
  kind: Kind;
  windowDays: number;
  direction: Direction;
  limit?: number;
  minPrice?: number;
}): Promise<MoverRow[]> {
  const db = getDb();
  const order = sql.raw(direction === "gainers" ? "DESC" : "ASC");
  const gameFilter = game ? sql`AND c.game = ${game}` : sql``;
  const isSingle = kind === "single";

  const res = await db.execute(sql`
    WITH bounds AS (
      SELECT max(date) AS latest, min(date) AS earliest FROM price_snapshots
    ),
    tgt AS (
      SELECT latest, earliest,
        GREATEST(earliest, latest - make_interval(days => ${windowDays}))::date AS target
      FROM bounds
    ),
    cur AS (
      SELECT ps.product_id, ps.sub_type_name, ps.market_price
      FROM price_snapshots ps, tgt
      WHERE ps.date = tgt.latest AND ps.market_price IS NOT NULL
    ),
    prev AS (
      SELECT DISTINCT ON (ps.product_id, ps.sub_type_name)
        ps.product_id, ps.sub_type_name, ps.market_price, ps.date
      FROM price_snapshots ps, tgt
      WHERE ps.date <= tgt.target AND ps.market_price IS NOT NULL
      ORDER BY ps.product_id, ps.sub_type_name, ps.date DESC
    )
    SELECT
      c.game            AS "game",
      c.product_id      AS "productId",
      c.name            AS "name",
      c.group_name      AS "groupName",
      c.image_url       AS "imageUrl",
      c.url             AS "url",
      c.rarity          AS "rarity",
      c.number          AS "number",
      cur.sub_type_name AS "subTypeName",
      cur.market_price  AS "curPrice",
      prev.market_price AS "prevPrice",
      prev.date         AS "prevDate",
      (SELECT latest FROM bounds) AS "latestDate",
      (cur.market_price - prev.market_price) AS "absChange",
      ((cur.market_price - prev.market_price) / prev.market_price) AS "pctChange"
    FROM cur
    JOIN prev ON prev.product_id = cur.product_id AND prev.sub_type_name = cur.sub_type_name
    JOIN cards c ON c.product_id = cur.product_id
    WHERE prev.market_price >= ${minPrice}
      AND cur.market_price <> prev.market_price
      AND prev.date < (SELECT latest FROM bounds)
      AND c.is_single = ${isSingle}
      ${gameFilter}
    ORDER BY "pctChange" ${order}
    LIMIT ${limit}
  `);

  return rowsOf<MoverRow>(res);
}

/** Highest current market price. Works from the very first ingest. */
export async function getMostValuable({
  game,
  kind = "single",
  limit = 100,
}: {
  game?: GameSlug;
  kind?: Kind;
  limit?: number;
}): Promise<ValuableRow[]> {
  const db = getDb();
  const gameFilter = game ? sql`AND c.game = ${game}` : sql``;
  const isSingle = kind === "single";

  // Return market and (sane) listing price separately so the UI can show both.
  // Listing = mid, then low, then high, ignoring TCGplayer's >= 99999 sentinels.
  // Rank by whichever price we have (market preferred, else listing).
  const res = await db.execute(sql`
    WITH latest AS (SELECT max(date) AS d FROM price_snapshots),
    rows AS (
      SELECT
        c.game, c.product_id, c.name, c.group_name, c.image_url, c.url,
        c.rarity, c.number, ps.sub_type_name,
        ps.market_price AS market,
        COALESCE(
          (CASE WHEN ps.mid_price  < 99999 THEN ps.mid_price  END),
          (CASE WHEN ps.low_price  < 99999 THEN ps.low_price  END),
          (CASE WHEN ps.high_price < 99999 THEN ps.high_price END)
        ) AS listing
      FROM price_snapshots ps
      JOIN latest ON ps.date = latest.d
      JOIN cards c ON c.product_id = ps.product_id
      WHERE c.is_single = ${isSingle} ${gameFilter}
    )
    SELECT
      game          AS "game",
      product_id    AS "productId",
      name          AS "name",
      group_name    AS "groupName",
      image_url     AS "imageUrl",
      url           AS "url",
      rarity        AS "rarity",
      number        AS "number",
      sub_type_name AS "subTypeName",
      market        AS "marketPrice",
      listing       AS "listingPrice"
    FROM rows
    WHERE COALESCE(market, listing) IS NOT NULL
    ORDER BY COALESCE(market, listing) DESC
    LIMIT ${limit}
  `);

  return rowsOf<ValuableRow>(res);
}

export interface GameStats {
  latestDate: string | null;
  earliestDate: string | null;
  daysOfHistory: number;
  cardCount: number;
}

/** Coverage summary used to drive empty states and "data through" labels. */
export async function getGameStats(game?: GameSlug): Promise<GameStats> {
  const db = getDb();
  const gameFilter = game ? sql`WHERE c.game = ${game}` : sql``;
  const res = await db.execute(sql`
    SELECT
      max(ps.date) AS "latestDate",
      min(ps.date) AS "earliestDate",
      count(DISTINCT ps.date) AS "days",
      count(DISTINCT c.product_id) AS "cards"
    FROM cards c
    LEFT JOIN price_snapshots ps ON ps.product_id = c.product_id
    ${gameFilter}
  `);
  const row = rowsOf<{
    latestDate: string | null;
    earliestDate: string | null;
    days: number;
    cards: number;
  }>(res)[0];

  return {
    latestDate: row?.latestDate ?? null,
    earliestDate: row?.earliestDate ?? null,
    daysOfHistory: Number(row?.days ?? 0),
    cardCount: Number(row?.cards ?? 0),
  };
}
