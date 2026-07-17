import { getDb } from "@/db";
import { sql } from "drizzle-orm";
import { isAdmin, adminConfigured } from "@/lib/admin";
import { GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { money } from "@/lib/format";
import { safeLoad } from "@/lib/safe";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { PasscodeForm } from "./PasscodeForm";
import { ReviewGrid, type ReviewCard } from "./ReviewGrid";
import { RefreshButton } from "./RefreshButton";

export const dynamic = "force-dynamic";
export const metadata = { title: "Photo review — TCG Forecast", robots: { index: false } };

const PAGE = 24;

/**
 * Human review of the eBay listing photos.
 *
 * The matcher can only judge whether a listing's TITLE is plausible. Whether the
 * picture is sleeved, blurry, cropped, a slab, or both halves of a LEGEND card on
 * someone's table is a question only eyes answer — so this is the queue for
 * answering it, a card at a time.
 */
export default async function AdminPhotosPage({
  searchParams,
}: {
  searchParams: Promise<{ show?: string }>;
}) {
  if (!adminConfigured()) {
    return (
      <Shell>
        <p className="rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-amber-200/85">
          <strong className="font-semibold text-amber-200">
            ADMIN_PASSCODE isn&apos;t set.
          </strong>{" "}
          Add it to your environment (and to Vercel) and redeploy. Until then this
          page stays locked — it won&apos;t fall open just because the variable is
          missing.
        </p>
      </Shell>
    );
  }

  if (!(await isAdmin())) {
    return (
      <Shell>
        <PasscodeForm />
      </Shell>
    );
  }

  const sp = await searchParams;
  const show = sp.show === "good" || sp.show === "bad" ? sp.show : "todo";

  const { data, error } = await safeLoad(async () => {
    const db = getDb();
    const rowsOf = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? []);

    const filter =
      show === "todo"
        ? sql`ebay_photo_url IS NOT NULL AND photo_verdict IS NULL`
        : show === "good"
          ? sql`photo_verdict = 'good'`
          : sql`photo_verdict = 'bad'`;

    const [cards, counts] = await Promise.all([
      db.execute(sql`
        SELECT product_id AS "productId", game, language, name, group_name AS "groupName",
               rarity, number, ebay_photo_url AS "photoUrl",
               ebay_listing_url AS "listingUrl", ebay_listing_title AS "listingTitle",
               ebay_listing_price AS "listingPrice",
               COALESCE(market_price, listing_price) AS "value"
        FROM cards
        WHERE ${filter}
        ORDER BY COALESCE(market_price, listing_price) DESC NULLS LAST, name
        LIMIT ${PAGE}
      `),
      db.execute(sql`
        SELECT
          count(*) FILTER (WHERE ebay_photo_url IS NOT NULL AND photo_verdict IS NULL)::int AS todo,
          count(*) FILTER (WHERE photo_verdict = 'good')::int AS good,
          count(*) FILTER (WHERE photo_verdict = 'bad')::int  AS bad
        FROM cards
      `),
    ]);
    return {
      cards: rowsOf<ReviewCard & { game: string }>(cards),
      counts: rowsOf<{ todo: number; good: number; bad: number }>(counts)[0] ?? {
        todo: 0,
        good: 0,
        bad: 0,
      },
    };
  });

  if (error) return <Shell><DbErrorBanner error={error} /></Shell>;
  if (!data) return null;

  const { cards, counts } = data;
  const done = counts.good + counts.bad;
  const total = done + counts.todo;

  const enriched: ReviewCard[] = cards.map((c) => ({
    ...c,
    gameName: isGameSlug(c.game) ? GAME_BY_SLUG[c.game].name : c.game,
    valueLabel: c.value != null ? money(c.value) : null,
    priceLabel: c.listingPrice != null ? money(c.listingPrice) : null,
  }));

  return (
    <Shell>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <Tab href="/admin/photos" active={show === "todo"}>
            To review <Count n={counts.todo} />
          </Tab>
          <Tab href="/admin/photos?show=good" active={show === "good"}>
            Good <Count n={counts.good} />
          </Tab>
          <Tab href="/admin/photos?show=bad" active={show === "bad"}>
            Rejected <Count n={counts.bad} />
          </Tab>
        </div>
        <div className="flex items-center gap-4">
          <p className="text-xs text-white/40">
            {done} of {total} reviewed
            {total > 0 && ` · ${Math.round((done / total) * 100)}%`}
          </p>
          <RefreshButton />
        </div>
      </div>

      {/* Progress, because "I can do this slowly" needs somewhere to come back to. */}
      <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-emerald-500/70"
          style={{ width: total > 0 ? `${(done / total) * 100}%` : "0%" }}
        />
      </div>

      {enriched.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-12 text-center text-sm text-white/40">
          {show === "todo"
            ? "Nothing left to review. Every photo has a verdict."
            : show === "good"
              ? "No photos approved yet."
              : "No photos rejected yet."}
        </p>
      ) : (
        <ReviewGrid cards={enriched} reviewed={show !== "todo"} />
      )}

      {show === "todo" && counts.todo > PAGE && (
        <p className="text-center text-xs text-white/35">
          Showing the {PAGE} most valuable. Judge these and the next {PAGE} appear.
        </p>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Photo <span className="text-white/50">review</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          These cards have no official art, so the site shows a photo from a live
          eBay listing. Is it actually this card, and can you see it? Reject
          anything sleeved beyond recognition, cropped, showing the wrong printing,
          or showing more than one card.
        </p>
      </div>
      {children}
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active ? "bg-white/10 text-white" : "text-white/50 hover:bg-white/5 hover:text-white/80"
      }`}
    >
      {children}
    </a>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-white/10 px-1.5 text-[11px] tabular-nums text-white/60">
      {n}
    </span>
  );
}
