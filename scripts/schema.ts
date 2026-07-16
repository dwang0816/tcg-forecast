// Apply scripts/schema.sql to DATABASE_URL. Idempotent — safe to re-run.
//
//   npm run schema
//
// Stands up a fresh database (Railway, local, wherever) with the real schema,
// including the bits Drizzle can't express: the search_text generated column and
// the trigram indexes. See scripts/schema.sql for why this exists.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

import { readFileSync } from "fs";
import { join } from "path";

async function main() {
  const { getPool } = await import("../src/db");
  const pool = getPool();
  const sql = readFileSync(join(__dirname, "schema.sql"), "utf8");

  const host = new URL(process.env.DATABASE_URL!).host;
  console.log(`applying schema.sql -> ${host}`);

  await pool.query(sql);

  const { rows } = await pool.query(`
    SELECT table_name, (SELECT count(*) FROM information_schema.columns c
                        WHERE c.table_name = t.table_name) AS cols
    FROM information_schema.tables t
    WHERE table_schema = 'public' ORDER BY table_name`);
  console.table(rows);

  const idx = await pool.query(
    `SELECT count(*)::int AS n FROM pg_indexes WHERE schemaname = 'public'`,
  );
  console.log(`indexes: ${idx.rows[0].n}`);
  await pool.end();
  console.log("schema applied");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
