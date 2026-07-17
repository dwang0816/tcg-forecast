// Find live eBay listing photos for cards that have no art from any source.
//
//   pnpm run photos            -> tracked cards missing art, never checked before
//   pnpm run photos 50         -> cap the number of cards attempted
//   pnpm run photos 50 recheck -> also re-check cards we've looked at before
//
// Why this exists: TCGplayer has no art for whole old Japanese sets (HeartGold /
// SoulSilver 2010, Ultra Sun & Moon deck boxes), and re-asking it forever won't
// change that. Nothing here copies an image — we store the listing's URL and the
// site shows it captioned as the seller's photo, linked to their listing.
//
// Not part of the daily cron on purpose: new sets always ship with art, so this
// only concerns a fixed set of old cards. Listings do end, though, so re-running
// occasionally replaces photos whose listings have closed.
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const limit = Number(process.argv[2] ?? 500);
  const recheck = process.argv.includes("recheck");

  const { getDb, getPool } = await import("../src/db");
  const { sql } = await import("drizzle-orm");
  const { ebayToken, findListingPhoto } = await import("../src/lib/ebay");

  const token = await ebayToken();
  if (!token) throw new Error("No eBay token — check EBAY_CLIENT_ID / EBAY_CLIENT_SECRET.");

  const db = getDb();
  const rowsOf = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? []);

  // Only tracked cards (the ones anyone actually looks at), only those with no
  // art from any source, and only those with a number — the number is the anchor
  // that makes a match trustworthy, so cards without one are skipped entirely.
  const res = await db.execute(sql`
    SELECT product_id, game, name, group_name, number, language, market_price,
           -- Does any OTHER card of ours share this name and number? Only then
           -- does the title need to name the set (see matchesCard).
           (SELECT count(*) FROM cards o
             WHERE o.game = cards.game AND o.language = cards.language
               AND o.name = cards.name AND o.number = cards.number) > 1 AS ambiguous,
           -- The rival printings of this number. Their qualifiers are what a
           -- title must not claim: (Metal) must not match (Metal) (Prize Wall).
           (SELECT COALESCE(array_agg(o.name), '{}') FROM cards o
             WHERE o.game = cards.game AND o.language = cards.language
               AND o.number = cards.number AND o.product_id <> cards.product_id) AS sibling_names,
           rejected_photo_urls
    FROM cards
    WHERE tracked
      AND number IS NOT NULL
      AND image_url IS NULL
      AND (alt_image_urls IS NULL OR array_length(alt_image_urls, 1) = 0)
      AND ebay_photo_url IS NULL
      ${recheck ? sql`` : sql`AND ebay_photo_at IS NULL`}
    ORDER BY market_price DESC NULLS LAST
    LIMIT ${limit}
  `);
  const cards = rowsOf<{
    product_id: number;
    game: string;
    name: string;
    group_name: string;
    number: string | null;
    language: string;
    market_price: number | null;
    ambiguous: boolean;
    sibling_names: string[] | null;
    rejected_photo_urls: string[] | null;
  }>(res);

  console.log(`${cards.length} cards to look up (most valuable first)\n`);

  let found = 0;
  for (const c of cards) {
    const photo = await findListingPhoto(token, {
      game: c.game,
      name: c.name,
      number: c.number,
      groupName: c.group_name,
      language: c.language,
      ambiguous: c.ambiguous,
      siblingNames: c.sibling_names,
      rejectedPhotoUrls: c.rejected_photo_urls,
    });

    // Stamp the timestamp either way: a miss is worth remembering so the next run
    // spends its quota on cards we haven't tried.
    //
    // A found photo also clears any old verdict. Without that, a card rejected
    // months ago gets a brand new picture and keeps the 'bad' someone gave the
    // last one — a human judgement attached to a photo no human has seen, on a
    // card that can never come back to the queue to be judged, because the queue
    // wants an unjudged verdict. A miss keeps its verdict: nothing changed for
    // it, so there's nothing to re-judge.
    await db.execute(sql`
      UPDATE cards SET
        ebay_photo_url     = ${photo?.imageUrl ?? null},
        ebay_listing_url   = ${photo?.listingUrl ?? null},
        ebay_listing_title = ${photo?.title ?? null},
        ebay_listing_price = ${photo?.price ?? null},
        ebay_photo_at      = now()
        ${
          photo
            ? // Nobody has seen this one: it goes to the front of the queue with
              // a flame on it. photo_found_at is set HERE and only here — this is
              // the unattended path, and "new" means a picture that arrived while
              // you weren't looking.
              sql`, photo_verdict = NULL, photo_reviewed_at = NULL, photo_found_at = now()`
            : sql``
        }
      WHERE product_id = ${c.product_id}
    `);

    if (photo) {
      found++;
      console.log(
        `  found  $${String(c.market_price ?? "-").padStart(7)}  ${c.number} ${c.name.slice(0, 30)}`,
      );
      console.log(`         ${photo.title.slice(0, 72)}`);
    } else {
      console.log(
        `  none   $${String(c.market_price ?? "-").padStart(7)}  ${c.number} ${c.name.slice(0, 30)}`,
      );
    }
    await sleep(250); // be polite; Browse allows far more than we need
  }

  console.log(`\ndone — ${found}/${cards.length} got a photo`);
  await getPool().end();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
