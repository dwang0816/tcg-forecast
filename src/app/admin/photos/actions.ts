"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { isAdmin, signIn, signOut } from "@/lib/admin";

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
}

/** Undo the last call — misclicks happen when you're going quickly. */
export async function undo(productId: number) {
  if (!(await isAdmin())) throw new Error("Not signed in");
  const db = getDb();
  // Only clears the verdict. A rejected photo's URL stays on the reject list and
  // its fields stay cleared: the picture is gone either way, and un-rejecting it
  // would mean re-running the photo job anyway.
  await db.execute(sql`
    UPDATE cards SET photo_verdict = NULL, photo_reviewed_at = NULL
    WHERE product_id = ${productId}
  `);
  revalidatePath("/admin/photos");
}
