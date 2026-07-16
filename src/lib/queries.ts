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

// node-postgres returns a QueryResult, which carries the rows on `.rows`. This
// is why db/index.ts uses node-postgres and not postgres.js — that driver returns
// a bare array, so every caller here would quietly get [] instead of throwing.
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
/**
 * How far before the target date getMovers will accept a "previous" price.
 *
 * Load-bearing in two ways. Without a lower bound, the prev CTE's date <= target
 * selects the entire history back to 2024 — 8.5M rows for DISTINCT ON to sort,
 * which took 12 seconds. That was invisible when we held 45 days of snapshots.
 *
 * It's also a correctness fix. Unbounded, a card whose nearest earlier snapshot
 * was a year old got compared against that price and the result labelled a
 * "7-day change". Snapshots are daily, so a gap that big means we have no honest
 * basis for comparison and the card belongs out of the list — not in it with a
 * fabricated percentage.
 *
 * 3 days, measured rather than guessed. On a 7-day window it covers a missed cron
 * run with room to spare, and buys everything a wider bound does: at 3 days 876
 * One Piece singles are eligible, at 14 days 878 — and both extra cards are ones
 * whose "7-day" change was really measured over 8+ days. The tolerance past a few
 * days adds no coverage, only overstated windows.
 */
const PREV_LOOKBACK_DAYS = 3;

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
    -- The newest snapshot at or before the target date, per card+printing.
    -- (See PREV_LOOKBACK_DAYS above for why the lower bound matters.)
    prev AS (
      SELECT DISTINCT ON (ps.product_id, ps.sub_type_name)
        ps.product_id, ps.sub_type_name, ps.market_price, ps.date
      FROM price_snapshots ps, tgt
      WHERE ps.date <= tgt.target
        AND ps.date >= (tgt.target - make_interval(days => ${PREV_LOOKBACK_DAYS}))::date
        AND ps.market_price IS NOT NULL
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

/**
 * Card count and last-updated date for one game — reads `cards` only.
 *
 * The home page shows exactly these two numbers, one per game, and was calling
 * getGameStats() for them: three concurrent DISTINCT-date scans over 8.6M
 * snapshots (~770MB of reads each) to print "Updated Jul 16, 2026". They then
 * contended for Railway's disk and the page took 8-9s in production.
 *
 * ingest stamps cards.price_date with the snapshot date, so max(price_date) is
 * the same answer for ~5x less work and no snapshot access at all. Verified
 * equal to max(price_snapshots.date) for every game.
 *
 * Use getGameStats() where daysOfHistory/earliestDate are genuinely needed —
 * those can't come from `cards` and are worth their cost once per page.
 */
export async function getGameSummary(
  game: GameSlug,
): Promise<{ cardCount: number; latestDate: string | null }> {
  const db = getDb();
  const res = await db.execute(sql`
    SELECT count(*)::int AS "cardCount", max(price_date)::text AS "latestDate"
    FROM cards WHERE game = ${game}
  `);
  const row = rowsOf<{ cardCount: number; latestDate: string | null }>(res)[0];
  return { cardCount: Number(row?.cardCount ?? 0), latestDate: row?.latestDate ?? null };
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

  // Shaped carefully, because this is cheap at 600k snapshots and ruinous at 8.6M.
  //
  // The obvious version — one LEFT JOIN with count(DISTINCT ps.date) and
  // count(DISTINCT c.product_id) — made Postgres materialise all ~8M joined rows
  // and SORT them (140MB spilled to disk, 8.7s) just to find ~730 distinct dates.
  // count(DISTINCT) always forces a sort. A DISTINCT subquery doesn't: the planner
  // uses a HashAggregate, 8M rows collapse to 730 groups, and it drops to ~1.5s.
  //
  // Counting cards is also split out entirely — it only needs the cards index, and
  // dragging it through the join was what forced the second DISTINCT.
  const res = await db.execute(sql`
    SELECT
      (SELECT count(*)::int FROM cards c ${gameFilter}) AS "cards",
      d.latest   AS "latestDate",
      d.earliest AS "earliestDate",
      d.days     AS "days"
    FROM (
      SELECT max(t.date) AS latest, min(t.date) AS earliest, count(*)::int AS days
      FROM (
        SELECT DISTINCT ps.date
        FROM price_snapshots ps
        JOIN cards c ON c.product_id = ps.product_id
        ${gameFilter}
      ) t
    ) d
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
  midPrice: number | null;
  highPrice: number | null;
  directLowPrice: number | null;
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
      date::text        AS "date",
      sub_type_name     AS "subTypeName",
      market_price      AS "marketPrice",
      low_price         AS "lowPrice",
      mid_price         AS "midPrice",
      high_price        AS "highPrice",
      direct_low_price  AS "directLowPrice"
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
 * Every word you type must appear SOMEWHERE on the card: its name, set, rarity,
 * number, game or language. That's what makes "cleffa obsidian" find the Cleffa
 * from Obsidian Flames — the name holds one word and the set holds the other, so
 * matching a single field (or the raw phrase) finds nothing. Matching is against
 * a generated `search_text` blob with a trigram GIN index, so it stays fast.
 *
 * Ranking is by VALUE, matching the Most Valuable lists: confirmed TCGplayer
 * market price first, then ask-only cards by their listing price. This app is
 * about value, and the token matching above already narrows things — someone
 * hunting one specific card types its name and gets it either way. Ranking by
 * market price (not by any price) also stops the $99,999-style asks from
 * crowning results, exactly as in the rankings.
 *
 * If nothing matches, we retry fuzzily (trigram similarity on the name) so typos
 * like "charzard" still land somewhere useful.
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
}): Promise<{ rows: SearchResult[]; total: number; fuzzy: boolean }> {
  const db = getDb();
  const term = q.trim();
  if (!term) return { rows: [], total: 0, fuzzy: false };

  const tokens = term.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const gameFilter = game ? sql`AND c.game = ${game}` : sql``;
  const langFilter = language ? sql`AND c.language = ${language}` : sql``;
  const kindFilter = kind ? sql`AND c.is_single = ${kind === "single"}` : sql``;

  // Every token must appear somewhere on the card.
  let tokenWhere = sql`TRUE`;
  for (const t of tokens) {
    tokenWhere = sql`${tokenWhere} AND c.search_text LIKE ${"%" + t + "%"}`;
  }

  const SELECT = sql`
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
    c.tracked         AS "tracked"`;

  const where = sql`WHERE ${tokenWhere} ${gameFilter} ${langFilter} ${kindFilter}`;

  const countRes = await db.execute(sql`SELECT count(*)::int AS n FROM cards c ${where}`);
  const total = rowsOf<{ n: number }>(countRes)[0]?.n ?? 0;

  if (total > 0) {
    const res = await db.execute(sql`
      SELECT ${SELECT}
      FROM cards c
      ${where}
      ORDER BY
        c.market_price DESC NULLS LAST,
        c.listing_price DESC NULLS LAST,
        c.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `);
    return { rows: rowsOf<SearchResult>(res), total, fuzzy: false };
  }

  // Nothing matched — fall back to fuzzy name matching so typos still land.
  const fuzzyRes = await db.execute(sql`
    SELECT ${SELECT}
    FROM cards c
    WHERE similarity(c.name, ${term}) > 0.25 ${gameFilter} ${langFilter} ${kindFilter}
    ORDER BY similarity(c.name, ${term}) DESC,
             COALESCE(c.market_price, c.listing_price) DESC NULLS LAST
    LIMIT ${limit}
  `);
  const rows = rowsOf<SearchResult>(fuzzyRes);
  return { rows, total: rows.length, fuzzy: rows.length > 0 };
}
