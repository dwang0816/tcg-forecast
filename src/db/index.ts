import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let cached: NeonHttpDatabase<typeof schema> | null = null;

/**
 * Lazily construct the Drizzle client. We avoid doing this at module load so
 * that importing this file (e.g. during `next build`) doesn't require
 * DATABASE_URL to be present — only actually running a query does.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (cached) return cached;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Add your Neon connection string to .env.local (see .env.example).",
    );
  }

  cached = drizzle(neon(connectionString), { schema });
  return cached;
}
