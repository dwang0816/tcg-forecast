export interface DbErrorInfo {
  message: string;
  hint: string;
}

/** Turn a thrown DB/config error into a user-facing message + actionable hint. */
export function describeDbError(err: unknown): DbErrorInfo {
  const raw = String(err);

  if (!process.env.DATABASE_URL) {
    return {
      message: "DATABASE_URL is not set.",
      hint: "Add the Railway Postgres connection string as DATABASE_URL in Vercel (Project → Settings → Environment Variables), for all environments, then redeploy. Use Railway's DATABASE_PUBLIC_URL — its DATABASE_URL is a private *.railway.internal host that Vercel can't reach.",
    };
  }
  if (/relation .* does not exist|does not exist/i.test(raw)) {
    return {
      message: "The database is reachable, but the tables don't exist yet.",
      // NOT db:push. search_text is a generated column Drizzle can't express, so
      // schema.ts doesn't know about it — db:push would build a database with no
      // search_text and no trigram indexes, and search would break silently.
      hint: "Create them by running `npm run schema` locally with that DATABASE_URL in your .env.local.",
    };
  }
  if (/password authentication|authentication failed/i.test(raw)) {
    return {
      message: "The database rejected the credentials.",
      hint: "Re-copy DATABASE_PUBLIC_URL from Railway (Postgres service → Variables) — the password is regenerated if the service is recreated.",
    };
  }
  if (/ENOTFOUND|getaddrinfo|could not connect|connection|timeout/i.test(raw)) {
    return {
      message: "Couldn't connect to the database.",
      hint: "Check the DATABASE_URL host, and that the Railway Postgres service is running. If the host ends in .railway.internal it's the private URL, which only resolves inside Railway — use DATABASE_PUBLIC_URL.",
    };
  }
  return { message: "A database error occurred.", hint: raw.slice(0, 300) };
}

/** Run a page's data loader, returning either data or a described error. */
export async function safeLoad<T>(
  fn: () => Promise<T>,
): Promise<{ data: T | null; error: DbErrorInfo | null }> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    console.error("[tcg-forecast] data load failed:", e);
    return { data: null, error: describeDbError(e) };
  }
}
