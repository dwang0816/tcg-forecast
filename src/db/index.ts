import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

/**
 * Postgres client, over plain TCP via node-postgres.
 *
 * Why node-postgres and not postgres.js: our query layer reads `result.rows`
 * (see rowsOf() in lib/queries.ts). node-postgres returns a QueryResult that has
 * `.rows`; postgres.js returns a bare array that doesn't, which would make every
 * raw db.execute() silently yield ZERO rows instead of throwing — same data,
 * quietly wrong, the worst failure mode available. Don't swap this driver
 * without rewriting rowsOf() to match.
 *
 * Pooling on serverless: each Vercel lambda gets its own Pool, so `max` is per
 * instance, not global — keep it small, or a traffic spike opens hundreds of
 * connections against the server's max_connections. The pool is cached on
 * globalThis so warm invocations reuse it instead of reconnecting per request.
 *
 * Construction stays lazy so that importing this file (e.g. during `next build`)
 * doesn't require DATABASE_URL — only running a query does.
 */

const POOL_KEY = Symbol.for("tcg-forecast.pgpool");
type Global = typeof globalThis & {
  [POOL_KEY]?: { pool: Pool; db: NodePgDatabase<typeof schema> };
};

export function getDb(): NodePgDatabase<typeof schema> {
  const g = globalThis as Global;
  const existing = g[POOL_KEY];
  if (existing) return existing.db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Postgres connection string to .env.local (see .env.example).",
    );
  }

  // Railway terminates TLS at a proxy whose certificate won't chain to a local
  // root store, so verification is off — the connection is still encrypted. A
  // local server gets no TLS at all.
  const isLocal = /@(localhost|127\.0\.0\.1)/.test(connectionString);

  // Strip libpq SSL params and let the explicit `ssl` option below be the single
  // source of truth. pg 8.22 warns that it will start honouring sslmode the way
  // libpq does (i.e. verifying certs), which would break these proxies on some
  // future patch release. Two mechanisms disagreeing is the bug; keep one.
  const url = new URL(connectionString);
  url.searchParams.delete("sslmode");
  url.searchParams.delete("channel_binding");

  const pool = new Pool({
    connectionString: url.toString(),
    ssl: isLocal ? undefined : { rejectUnauthorized: false },
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 10_000,
  });
  // A dead idle connection must not take the whole process down with it.
  pool.on("error", (err) => console.error("[pg] idle client error", err.message));

  const db = drizzle(pool, { schema });
  g[POOL_KEY] = { pool, db };
  return db;
}

/** Raw pool — for scripts needing multi-statement SQL or a clean shutdown. */
export function getPool(): Pool {
  getDb();
  return (globalThis as Global)[POOL_KEY]!.pool;
}
