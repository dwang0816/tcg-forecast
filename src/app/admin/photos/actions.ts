"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { isAdmin, signIn, signOut } from "@/lib/admin";
import { PRICES_TAG } from "@/lib/cached";

/**
 * Every action re-checks isAdmin(). Server Actions are POST endpoints anyone can
 * call once they know the name — the page rendering behind a gate proves nothing
 * about who's calling these.
 */

export async function submitPasscode(_prev: string | null, form: FormData) {
  const passcode = String(form.get("passcode") ?? "");
  if (!passcode) return "Enter the passcode.";
  const ok = await signIn(passcode);
  if (!ok) return "That passcode isn't right.";
  revalidatePath("/admin/photos");
  return null;
}

export async function leave() {
  await signOut();
  revalidatePath("/admin/photos");
}

/** The photo shows the right card, clearly enough to be useful. */
export async function approve(productId: number) {
  if (!(await isAdmin())) throw new Error("Not signed in");
  const db = getDb();
  await db.execute(sql`
    UPDATE cards
    SET photo_verdict = 'good', photo_reviewed_at = now()
    WHERE product_id = ${productId}
  `);
  revalidatePath("/admin/photos");
  revalidatePath(`/card/${productId}`);
}

/**
 * The photo is wrong, unusable, or not really this card.
 *
 * Remembering the URL is the whole point. Clearing ebay_photo_url alone would let
 * the next `pnpm run photos` run rediscover the same listing and put the same bad
 * picture straight back — the reviewer's work would quietly undo itself.
 */
export async function reject(productId: number) {
  if (!(await isAdmin())) throw new Error("Not signed in");
  const db = getDb();
  await db.execute(sql`
    UPDATE cards
    SET rejected_photo_urls =
          CASE
            WHEN ebay_photo_url IS NULL THEN rejected_photo_urls
            ELSE array_append(COALESCE(rejected_photo_urls, '{}'), ebay_photo_url)
          END,
        ebay_photo_url = NULL,
        ebay_listing_url = NULL,
        ebay_listing_title = NULL,
        ebay_listing_price = NULL,
        -- Clearing this lets the photo job look again, now that it knows to skip
        -- the URL just rejected.
        ebay_photo_at = NULL,
        photo_verdict = 'bad',
        photo_reviewed_at = now()
    WHERE product_id = ${productId}
  `);
  revalidatePath("/admin/photos");
  revalidatePath(`/card/${productId}`);
  // The card page is uncached and fixes itself, but the TILES aren't: Most
  // Valuable, the movers lists and search all read through the day-long cache.
  // Without this, rejecting a bad photo left it sitting on every list for 24
  // hours — the exact opposite of what pressing the button means.
  //
  // Only on reject. Approving changes nothing anyone can see, so invalidating
  // the cache for it would be pure churn.
  //
  // "max" is stale-while-revalidate: a reviewer working through a batch marks
  // the tag stale repeatedly without firing off blocking scans of the history
  // table behind each click.
  revalidateTag(PRICES_TAG, "max");
}

/**
 * Drop the cached reads so the site shows what's in the database right now.
 *
 * Browsing pages cache for a day and are normally refreshed by /api/ingest
 * calling revalidateTag when it writes. But `pnpm run ingest` run from a laptop
 * writes the same rows with no Next server anywhere in the picture, so nothing
 * revalidates — the database moves and the site doesn't, silently, for up to a
 * day. That's not theoretical: set codes were derived and correct in the database
 * while every sealed tile kept rendering without them.
 *
 * Uses profile "max" for the same reason the ingest does: mark stale and serve
 * the old page while the new one loads behind, rather than expiring instantly and
 * making the next visitor wait on a multi-million-row scan.
 */
export async function refreshCache() {
  if (!(await isAdmin())) throw new Error("Not signed in");
  revalidateTag(PRICES_TAG, "max");
}

/** Undo the last call — misclicks happen when you're going quickly. */
export async function undo(productId: number) {
  if (!(await isAdmin())) throw new Error("Not signed in");
  const db = getDb();
  // Clearing the verdict alone was a trap. Reject blacklists the photo URL and
  // clears the photo, so a verdict-only undo left the card with no photo, no
  // verdict, and a permanent blacklist entry — invisible in all three tabs (To
  // review needs a photo; Good and Bad need a verdict) and unrecoverable, because
  // the photo job skips blacklisted URLs. One mis-click and the card was gone.
  //
  // So undoing a rejection also lifts the blacklist. The photo itself can't come
  // back here — reject dropped the listing url/title/price and we don't keep them
  // — but the next `pnpm run photos` can now re-find that listing instead of
  // skipping it forever.
  await db.execute(sql`
    UPDATE cards SET
      photo_verdict = NULL,
      photo_reviewed_at = NULL,
      rejected_photo_urls = CASE
        WHEN photo_verdict = 'bad' AND array_length(rejected_photo_urls, 1) > 0
          THEN rejected_photo_urls[1:array_length(rejected_photo_urls, 1) - 1]
        ELSE rejected_photo_urls
      END,
      -- Null means "never asked", which puts it back in the photo job's queue.
      ebay_photo_at = CASE WHEN photo_verdict = 'bad' THEN NULL ELSE ebay_photo_at END
    WHERE product_id = ${productId}
  `);
  revalidatePath("/admin/photos");
  revalidateTag(PRICES_TAG, "max");
}
