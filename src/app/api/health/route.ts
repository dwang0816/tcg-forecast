import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function rowsOf<T>(res: unknown): T[] {
  const r = res as { rows?: T[] };
  return (Array.isArray(res) ? (res as T[]) : r.rows) ?? [];
}

/**
 * Diagnostic endpoint. Never throws — returns JSON describing whether the
 * environment and database are wired up. Fetch /api/health to see what's wrong.
 */
export async function GET() {
  const databaseUrlSet = Boolean(process.env.DATABASE_URL);
  const cronSecretSet = Boolean(process.env.CRON_SECRET);

  const out: Record<string, unknown> = {
    databaseUrlSet,
    cronSecretSet,
    dbConnected: false,
    tablesExist: false,
  };

  try {
    const db = getDb();
    const cards = await db.execute(sql`SELECT count(*)::int AS n FROM cards`);
    const cardRows = rowsOf<{ n: number }>(cards);
    out.dbConnected = true;
    out.tablesExist = true;
    out.cardCount = cardRows[0]?.n ?? 0;

    const snaps = await db.execute(
      sql`SELECT count(*)::int AS n, count(DISTINCT date)::int AS days, max(date) AS latest FROM price_snapshots`,
    );
    const snapRows = rowsOf<{ n: number; days: number; latest: string }>(snaps);
    out.snapshotCount = snapRows[0]?.n ?? 0;
    out.distinctDays = snapRows[0]?.days ?? 0;
    out.latestDate = snapRows[0]?.latest ?? null;
  } catch (e) {
    out.error = String(e);
  }

  return NextResponse.json(out);
}
