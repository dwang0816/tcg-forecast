import { unstable_cache } from "next/cache";
import {
  getMovers,
  getMostValuable,
  getGameStats,
  getGameSummary,
  getCardsWithoutPictures,
  getGapCounts,
} from "./queries";

/**
 * Cached reads for the browsing pages.
 *
 * Every price on this site comes from tcgcsv, which publishes once a day. We were
 * re-querying millions of snapshot rows on every click for numbers that cannot
 * change until tomorrow — the site did the work of a live system while carrying
 * the data of a daily one.
 *
 * So results are cached and tagged. The window is deliberately long because the
 * ingest calls revalidateTag(PRICES_TAG) the moment it writes new prices: the
 * cache doesn't expire on a timer hoping to catch fresh data, it's told. The
 * timer is only a backstop in case a revalidate is missed.
 *
 * On Vercel this uses the shared Data Cache, so a cache fill by one request
 * serves every other instance too — which is what stops three people clicking
 * "Top 20 Gainers" from becoming three concurrent scans of the history table.
 *
 * Cache keys are derived from the arguments, so each game/view/window/language
 * combination is its own entry. Everything crossing this boundary is JSON —
 * verified that date columns arrive as "YYYY-MM-DD" strings via drizzle's type
 * parsers (raw pg would hand back Date objects, which would not survive).
 */

export const PRICES_TAG = "prices";

// Long, because revalidateTag on ingest is the real freshness mechanism. Also
// bounds staleness if a cron run writes without revalidating for any reason.
const ONE_DAY = 86_400;

export const getMoversCached = unstable_cache(getMovers, ["movers"], {
  tags: [PRICES_TAG],
  revalidate: ONE_DAY,
});

export const getMostValuableCached = unstable_cache(getMostValuable, ["valuable"], {
  tags: [PRICES_TAG],
  revalidate: ONE_DAY,
});

export const getGameStatsCached = unstable_cache(getGameStats, ["game-stats"], {
  tags: [PRICES_TAG],
  revalidate: ONE_DAY,
});

export const getGameSummaryCached = unstable_cache(getGameSummary, ["game-summary"], {
  tags: [PRICES_TAG],
  revalidate: ONE_DAY,
});

export const getCardsWithoutPicturesCached = unstable_cache(
  getCardsWithoutPictures,
  ["cards-without-pictures"],
  { tags: [PRICES_TAG], revalidate: ONE_DAY },
);

export const getGapCountsCached = unstable_cache(getGapCounts, ["gap-counts"], {
  tags: [PRICES_TAG],
  revalidate: ONE_DAY,
});
