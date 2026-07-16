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
      hint: "Add your Neon connection string as a DATABASE_URL environment variable in Vercel (Project → Settings → Environment Variables), for all environments, then redeploy.",
    };
  }
  if (/relation .* does not exist|does not exist/i.test(raw)) {
    return {
      message: "The database is reachable, but the tables don't exist yet.",
      hint: "Create them by running `npm run db:push` locally with the production DATABASE_URL in your .env.local.",
    };
  }
  if (/password authentication|authentication failed/i.test(raw)) {
    return {
      message: "The database rejected the credentials.",
      hint: "Double-check the DATABASE_URL — use the pooled connection string from Neon, including the password and `?sslmode=require`.",
    };
  }
  if (/ENOTFOUND|getaddrinfo|could not connect|connection|timeout/i.test(raw)) {
    return {
      message: "Couldn't connect to the database.",
      hint: "Verify the DATABASE_URL host is correct and the Neon project is active (not suspended).",
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
