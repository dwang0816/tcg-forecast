import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { GameSlug, Language } from "./games";

export type Direction = "gainers" | "losers";
export type Kind = "single" | "sealed";

export interface MoverRow {
  game: string;
  productId: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  altImageUrls: string[] | null;
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
  /** Current listing spread — drives the confidence signal (see lib/confidence.ts). */
  lowPrice: number | null;
  highPrice: number | null;
}

export interface ValuableRow {
  game: string;
  productId: number;
  name: string;
  groupName: string;
  imageUrl: string | null;
  altImageUrls: string[] | null;
  url: string | null;
  rarity: string | null;
  number: string | null;
  subTypeName: string;
  /** TCGplayer market price (sales-based). Null when TCGplayer has none. */
  marketPrice: number | null;
  /** TCGplayer average listing price (mid, then low/high), ignoring junk sentinels. */
  listingPrice: number | null;
  /** Current listing spread — drives the confidence signal (see lib/confidence.ts). */
  lowPrice: number | null;
  highPrice: number | null;
  // eBay fields intentionally omitted until a sold-data source is wired.
}

// Drizzle's neon-http driver returns results on `.rows`.
function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (Array.isArray(res) ? (res as T[]) : r.rows) ?? [];
}

/**
 * Confidence multiplier from the listing spread. Must mirror confidenceFactor()
 * in lib/confidence.ts — that one drives the UI badge, this one drives ranking.
 */
const SQL_CONFIDENCE = sql`
  CASE
    WHEN cur.low_price IS NULL OR cur.low_price <= 0 OR cur.high_price IS NULL THEN 0.5
    WHEN cur.high_price / cur.low_price < 2  THEN 1.0
    WHEN cur.high_price / cur.low_price < 4  THEN 0.8
    WHEN cur.high_price / cur.low_price < 10 THEN 0.55
    ELSE 0.3
  END`;

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
  language,
  kind,
  windowDays,
  direction,
  limit = 20,
  minPrice = 2,
}: {
  game?: GameSlug;
  language?: Language;
  kind: Kind;
  windowDays: number;
  direction: Direction;
  limit?: number;
  minPrice?: number;
}): Promise<MoverRow[]> {
  const db = getDb();
  const order = sql.raw(direction === "gainers" ? "DESC" : "ASC");
  const gameFilter = game ? sql`AND c.game = ${game}` : sql``;
  const langFilter = language ? sql`AND c.language = ${language}` : sql``;
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
      SELECT ps.product_id, ps.sub_type_name, ps.market_price,
             ps.low_price, ps.high_price
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
      c.alt_image_urls  AS "altImageUrls",
      c.url             AS "url",
      c.rarity          AS "rarity",
      c.number          AS "number",
      cur.sub_type_name AS "subTypeName",
      cur.market_price  AS "curPrice",
      cur.low_price     AS "lowPrice",
      cur.high_price    AS "highPrice",
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
      ${gameFilter} ${langFilter}
    ORDER BY
      ((cur.market_price - prev.market_price) / prev.market_price) * ${SQL_CONFIDENCE} ${order}
    LIMIT ${limit}
  `);

  return rowsOf<MoverRow>(res);
}

/** Highest current market price. Works from the very first ingest. */
/**
 * Most valuable cards.
 * - basis "confirmed":   only cards with a real TCGplayer market price (an actual
 *                        sales-based value), ranked by it. This is the honest list.
 * - basis "unconfirmed": cards with NO market price — nobody has bought one — so
 *                        all we have is a seller's asking price. Ranked by ask and
 *                        shown separately so fantasy numbers can't top the list.
 * (When eBay sold data lands, its median becomes the primary "confirmed" signal.)
 */
export async function getMostValuable({
  game,
  language,
  kind = "single",
  limit = 100,
  basis = "confirmed",
}: {
  game?: GameSlug;
  language?: Language;
  kind?: Kind;
  limit?: number;
  basis?: "confirmed" | "unconfirmed";
}): Promise<ValuableRow[]> {
  const db = getDb();
  const gameFilter = game ? sql`AND c.game = ${game}` : sql``;
  const langFilter = language ? sql`AND c.language = ${language}` : sql``;
  const isSingle = kind === "single";
  const basisFilter =
    basis === "confirmed"
      ? sql`WHERE market IS NOT NULL`
      : sql`WHERE market IS NULL AND listing IS NOT NULL`;
  const orderCol = basis === "confirmed" ? sql.raw("market") : sql.raw("listing");

  // Return market and listing price separately so the UI can show both. Listing
  // = mid, then low, then high — TCGplayer's actual listed price, including the
  // $99,999-style placeholders sellers park ultra-rare grails at. Rank by
  // whichever price we have (market preferred, else listing).
  const res = await db.execute(sql`
    WITH latest AS (SELECT max(date) AS d FROM price_snapshots),
    rows AS (
      SELECT
        c.game, c.product_id, c.name, c.group_name, c.image_url, c.alt_image_urls,
        c.url, c.rarity, c.number, ps.sub_type_name,
        ps.market_price AS market,
        ps.low_price, ps.high_price,
        COALESCE(ps.mid_price, ps.low_price, ps.high_price) AS listing
      FROM price_snapshots ps
      JOIN latest ON ps.date = latest.d
      JOIN cards c ON c.product_id = ps.product_id
      WHERE c.is_single = ${isSingle} ${gameFilter} ${langFilter}
    )
    SELECT
      game          AS "game",
      product_id    AS "productId",
      name          AS "name",
      group_name    AS "groupName",
      image_url      AS "imageUrl",
      alt_image_urls AS "altImageUrls",
      url            AS "url",
      rarity        AS "rarity",
      number        AS "number",
      sub_type_name AS "subTypeName",
      market        AS "marketPrice",
      listing       AS "listingPrice",
      low_price     AS "lowPrice",
      high_price    AS "highPrice"
    FROM rows
    ${basisFilter}
    ORDER BY ${orderCol} DESC
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
export async function getGameStats(
  game?: GameSlug,
  language?: Language,
): Promise<GameStats> {
  const db = getDb();
  const conds = [];
  if (game) conds.push(sql`c.game = ${game}`);
  if (language) conds.push(sql`c.language = ${language}`);
  let gameFilter = sql``;
  if (conds.length === 1) gameFilter = sql`WHERE ${conds[0]}`;
  if (conds.length === 2) gameFilter = sql`WHERE ${conds[0]} AND ${conds[1]}`;
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

export interface CardDetail {
  productId: number;
  game: string;
  language: string;
  name: string;
  groupName: string;
  rarity: string | null;
  number: string | null;
  imageUrl: string | null;
  altImageUrls: string[] | null;
  url: string | null;
  isSingle: boolean;
  extended: { name: string; displayName: string; value: string }[] | null;
}

export interface HistoryPoint {
  date: string;
  subTypeName: string;
  marketPrice: number | null;
  lowPrice: number | null;
  highPrice: number | null;
}

/** One card's metadata. Null when we don't have that product. */
export async function getCard(productId: number): Promise<CardDetail | null> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT
      product_id     AS "productId",
      game           AS "game",
      language       AS "language",
      name           AS "name",
      group_name     AS "groupName",
      rarity         AS "rarity",
      number         AS "number",
      image_url      AS "imageUrl",
      alt_image_urls AS "altImageUrls",
      url            AS "url",
      is_single      AS "isSingle",
      extended       AS "extended"
    FROM cards WHERE product_id = ${productId} LIMIT 1
  `);
  return rowsOf<CardDetail>(res)[0] ?? null;
}

/** Full daily price series for a card, oldest first, one row per subtype per day. */
export async function getCardHistory(productId: number): Promise<HistoryPoint[]> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT
      date::text       AS "date",
      sub_type_name    AS "subTypeName",
      market_price     AS "marketPrice",
      low_price        AS "lowPrice",
      high_price       AS "highPrice"
    FROM price_snapshots
    WHERE product_id = ${productId}
    ORDER BY date ASC, sub_type_name ASC
  `);
  return rowsOf<HistoryPoint>(res);
}

export interface SearchResult extends ValuableRow {
  tracked: boolean;
}

/**
 * Search the whole catalog — all ~71k cards, not just the tracked ones.
 *
 * Every card carries a current price (stamped on the card row each ingest), so
 * results are never dead ends. `tracked` tells the UI whether we also hold daily
 * history (and therefore a chart) for it.
 *
 * Matches on name (trigram-indexed) or exact card number, e.g. "OP01-024".
 */
export async function searchCards({
  q,
  game,
  language,
  kind,
  limit = 60,
  offset = 0,
}: {
  q: string;
  game?: GameSlug;
  language?: Language;
  kind?: Kind;
  limit?: number;
  offset?: number;
}): Promise<{ rows: SearchResult[]; total: number }> {
  const db = getDb();
  const term = q.trim();
  if (!term) return { rows: [], total: 0 };

  const like = `%${term}%`;
  const exact = term.toUpperCase();
  const gameFilter = game ? sql`AND c.game = ${game}` : sql``;
  const langFilter = language ? sql`AND c.language = ${language}` : sql``;
  const kindFilter =
    kind ? sql`AND c.is_single = ${kind === "single"}` : sql``;

  const where = sql`
    WHERE (c.name ILIKE ${like} OR upper(c.number) = ${exact})
    ${gameFilter} ${langFilter} ${kindFilter}`;

  const countRes = await db.execute(sql`
    SELECT count(*)::int AS n FROM cards c ${where}`);
  const total = rowsOf<{ n: number }>(countRes)[0]?.n ?? 0;

  const res = await db.execute(sql`
    SELECT
      c.game            AS "game",
      c.product_id      AS "productId",
      c.name            AS "name",
      c.group_name      AS "groupName",
      c.image_url       AS "imageUrl",
      c.alt_image_urls  AS "altImageUrls",
      c.url             AS "url",
      c.rarity          AS "rarity",
      c.number          AS "number",
      'Normal'          AS "subTypeName",
      c.market_price    AS "marketPrice",
      c.listing_price   AS "listingPrice",
      c.low_price       AS "lowPrice",
      c.high_price      AS "highPrice",
      c.tracked         AS "tracked"
    FROM cards c
    ${where}
    ORDER BY
      (upper(c.number) = ${exact}) DESC,     -- exact card code first
      COALESCE(c.market_price, c.listing_price) DESC NULLS LAST,
      c.name ASC
    LIMIT ${limit} OFFSET ${offset}
  `);

  return { rows: rowsOf<SearchResult>(res), total };
}
