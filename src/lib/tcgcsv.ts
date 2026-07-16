// Thin client for the tcgcsv.com mirror of TCGplayer's catalog + pricing.
// Usage guidelines (https://tcgcsv.com/docs): identify via User-Agent, keep
// under ~10k requests/day, ~100ms between requests, server-side only.

const BASE = "https://tcgcsv.com/tcgplayer";
const USER_AGENT = "tcg-forecast/0.1 (+https://github.com/)";

export interface TcgGroup {
  groupId: number;
  name: string;
  abbreviation: string | null;
  isSupplemental: boolean;
  publishedOn: string;
  modifiedOn: string;
  categoryId: number;
}

export interface TcgProduct {
  productId: number;
  name: string;
  cleanName: string | null;
  imageUrl: string | null;
  imageCount: number;
  categoryId: number;
  groupId: number;
  url: string | null;
  extendedData: { name: string; displayName: string; value: string }[];
}

export interface TcgPrice {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
}

interface TcgEnvelope<T> {
  success: boolean;
  errors: string[];
  results: T[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function getJson<T>(path: string, attempt = 0): Promise<T[]> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });

  // Back off and retry once on throttle / transient errors.
  if ((res.status === 429 || res.status >= 500) && attempt < 3) {
    await sleep(1000 * (attempt + 1));
    return getJson<T>(path, attempt + 1);
  }
  if (!res.ok) {
    throw new Error(`tcgcsv ${path} -> ${res.status} ${await res.text()}`);
  }

  const body = (await res.json()) as TcgEnvelope<T>;
  if (!body.success) {
    throw new Error(`tcgcsv ${path} error: ${body.errors?.join(", ")}`);
  }
  return body.results;
}

/**
 * The date tcgcsv's current data was published (UTC, "YYYY-MM-DD").
 *
 * This matters more than it looks. tcgcsv refreshes once a day around 20:00 UTC,
 * and we ingest 6x/day — so an ingest that runs before the refresh returns
 * YESTERDAY's prices. Stamping those with today's date creates a phantom day
 * that is a byte-for-byte copy of the real one, which silently breaks every
 * price-movement calculation (you end up diffing a day against itself).
 * Dating snapshots by the data's own publish date also lines the live ingest up
 * exactly with the archive dates used by scripts/backfill.ts.
 */
export async function getLastUpdated(): Promise<string | null> {
  try {
    const res = await fetch("https://tcgcsv.com/last-updated.txt", {
      headers: { "User-Agent": USER_AGENT },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const text = (await res.text()).trim(); // e.g. 2026-07-15T20:05:27+0000
    const date = new Date(text);
    if (Number.isNaN(date.getTime())) return null;
    return date.toISOString().slice(0, 10);
  } catch {
    return null;
  }
}

export function getGroups(categoryId: number) {
  return getJson<TcgGroup>(`/${categoryId}/groups`);
}

export function getProducts(categoryId: number, groupId: number) {
  return getJson<TcgProduct>(`/${categoryId}/${groupId}/products`);
}

export function getPrices(categoryId: number, groupId: number) {
  return getJson<TcgPrice>(`/${categoryId}/${groupId}/prices`);
}

/** Pull an extendedData value (e.g. "Rarity", "Number") off a product. */
export function extractExtended(product: TcgProduct, field: string): string | null {
  const match = product.extendedData?.find(
    (d) => d.name.toLowerCase() === field.toLowerCase(),
  );
  return match?.value ?? null;
}

/**
 * Run async tasks with bounded concurrency and a small inter-task delay so we
 * stay well under tcgcsv's per-second throttle threshold.
 */
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  async function worker() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await fn(items[i], i);
      await sleep(100);
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, worker);
  await Promise.all(workers);
  return results;
}
