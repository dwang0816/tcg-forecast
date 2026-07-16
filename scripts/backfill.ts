// Backfill historical price snapshots from tcgcsv's daily archives.
//
//   npm run backfill        -> last 30 days
//   npm run backfill 90     -> last 90 days
//
// tcgcsv publishes one 7z (PPMd) archive per day at
//   https://tcgcsv.com/archive/tcgplayer/prices-YYYY-MM-DD.ppmd.7z
// containing {date}/{categoryId}/{groupId}/prices — the same JSON the live API
// serves. Archives go back to roughly 2024-02. ~4MB/day compressed.
//
// This is a one-off local tool, not part of the deployed app: it shells out to
// 7-Zip to decompress (PPMd has no practical pure-JS decoder). Override the
// binary with SEVEN_ZIP if yours lives elsewhere.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { execFileSync } from "child_process";
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const SEVEN_ZIP = process.env.SEVEN_ZIP ?? "C:\\Program Files\\7-Zip\\7z.exe";
const UA = "tcg-forecast/0.1 (+backfill)";
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface PriceRow {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** YYYY-MM-DD for `daysAgo` days before today (UTC). */
function dateNDaysAgo(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const days = Number(process.argv[2] ?? 30);
  if (!existsSync(SEVEN_ZIP)) {
    throw new Error(`7-Zip not found at ${SEVEN_ZIP}. Set SEVEN_ZIP env var.`);
  }

  const { getDb } = await import("../src/db");
  const { priceSnapshots } = await import("../src/db/schema");
  const { GAMES } = await import("../src/lib/games");
  const { sql } = await import("drizzle-orm");
  const db = getDb();
  const rowsOf = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? []);

  // Only snapshot cards we track, and only ones that exist (FK to cards).
  const trackedRes = await db.execute(sql`SELECT product_id FROM cards WHERE tracked = true`);
  const tracked = new Set(rowsOf<{ product_id: number }>(trackedRes).map((r) => r.product_id));

  // Skip days we already have, so re-runs are cheap and idempotent.
  const haveRes = await db.execute(sql`SELECT DISTINCT date::text AS d FROM price_snapshots`);
  const have = new Set(rowsOf<{ d: string }>(haveRes).map((r) => r.d));

  console.log(`tracked cards: ${tracked.size} | dates already stored: ${have.size}`);

  const cats = GAMES.map((g) => g.categoryId);
  let totalInserted = 0;

  // Walk backwards from yesterday (today's archive won't exist until ~20:00 UTC).
  for (let i = 1; i <= days; i++) {
    const date = dateNDaysAgo(i);
    if (have.has(date)) {
      console.log(`${date}  skip (already stored)`);
      continue;
    }

    const url = `https://tcgcsv.com/archive/tcgplayer/prices-${date}.ppmd.7z`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) {
      console.log(`${date}  no archive (${res.status})`);
      await sleep(200);
      continue;
    }

    const dir = mkdtempSync(join(tmpdir(), "tcgbf-"));
    try {
      const archive = join(dir, "a.7z");
      writeFileSync(archive, Buffer.from(await res.arrayBuffer()));

      // Extract only our categories rather than all ~4,500 files.
      execFileSync(
        SEVEN_ZIP,
        ["x", archive, `-o${dir}`, ...cats.map((c) => `${date}/${c}/*`), "-y"],
        { stdio: "ignore" },
      );

      const rows: (typeof priceSnapshots.$inferInsert)[] = [];
      for (const cat of cats) {
        const catDir = join(dir, date, String(cat));
        if (!existsSync(catDir)) continue;
        for (const group of readdirSync(catDir)) {
          const file = join(catDir, group, "prices");
          if (!existsSync(file)) continue;
          const body = JSON.parse(readFileSync(file, "utf8")) as { results: PriceRow[] };
          for (const p of body.results ?? []) {
            if (!tracked.has(p.productId)) continue;
            if (p.marketPrice == null && p.lowPrice == null && p.midPrice == null && p.highPrice == null) continue;
            rows.push({
              productId: p.productId,
              subTypeName: p.subTypeName || "Normal",
              date,
              marketPrice: p.marketPrice,
              lowPrice: p.lowPrice,
              midPrice: p.midPrice,
              highPrice: p.highPrice,
              directLowPrice: p.directLowPrice,
            });
          }
        }
      }

      for (const batch of chunk(rows, 500)) {
        await db.insert(priceSnapshots).values(batch).onConflictDoNothing();
      }
      totalInserted += rows.length;
      console.log(`${date}  +${rows.length} snapshots`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    await sleep(300); // be polite to tcgcsv
  }

  console.log(`\ndone — ${totalInserted} snapshots inserted`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
