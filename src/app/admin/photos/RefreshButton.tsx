"use client";

import { useState, useTransition } from "react";
import { refreshCache } from "./actions";

/**
 * Drops the cached reads so the site reflects the database.
 *
 * Here rather than anywhere else because this is the page you're already on when
 * you've just changed data — approving and rejecting photos writes rows that the
 * browsing pages have cached for a day. Same button covers `pnpm run ingest` run
 * locally, which writes rows with no Next server around to revalidate anything.
 */
export function RefreshButton() {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() =>
          start(async () => {
            await refreshCache();
            setDone(true);
            setTimeout(() => setDone(false), 4000);
          })
        }
        disabled={pending}
        className="rounded-lg border border-edge px-3 py-1.5 text-xs font-medium text-ink-dim transition-colors hover:border-gold/40 hover:bg-gold/[0.06] hover:text-gold-bright disabled:opacity-50"
        title="Show what's in the database now, instead of waiting for the cache to expire"
      >
        {pending ? "Refreshing…" : "Refresh site data"}
      </button>
      {done && (
        <span className="font-mono text-xs text-up-bright">
          Done — pages will show fresh data.
        </span>
      )}
    </div>
  );
}
