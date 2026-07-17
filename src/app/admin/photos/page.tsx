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
import { GamePicker, orderGames } from "./GamePicker";

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
  searchParams: Promise<{ show?: string; game?: string }>;
}) {
  if (!adminConfigured()) {
    return (
      <Shell>
        <p className="rounded-xl border border-down/30 bg-down/[0.07] px-4 py-3 text-sm leading-relaxed text-ink-dim">
          <strong className="font-semibold text-down-bright">
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
  // "all" is the default pile, so an unknown ?game= falls back to it rather than
  // silently showing an empty queue.
  const game = sp.game && isGameSlug(sp.game) ? sp.game : "all";

  const { data, error } = await safeLoad(async () => {
    const db = getDb();
    const rowsOf = <T,>(r: unknown) => ((r as { rows?: T[] }).rows ?? []);

    const filter =
      show === "todo"
        ? sql`ebay_photo_url IS NOT NULL AND photo_verdict IS NULL`
        : show === "good"
          ? sql`photo_verdict = 'good'`
          : sql`photo_verdict = 'bad'`;
    const gameFilter = game === "all" ? sql`TRUE` : sql`game = ${game}`;

    const [cards, counts] = await Promise.all([
      db.execute(sql`
        SELECT product_id AS "productId", game, language, name, group_name AS "groupName",
               rarity, number, ebay_photo_url AS "photoUrl",
               ebay_listing_url AS "listingUrl", ebay_listing_title AS "listingTitle",
               ebay_listing_price AS "listingPrice",
               photo_review_count AS "reviewCount",
               COALESCE(market_price, listing_price) AS "value"
        FROM cards
        WHERE ${filter} AND ${gameFilter}
        ORDER BY COALESCE(market_price, listing_price) DESC NULLS LAST, name
        LIMIT ${PAGE}
      `),
      // Per game, not just the selected one: the picker needs every pile's
      // numbers to show what's left where, and the selected pile's row is just
      // one of them.
      db.execute(sql`
        SELECT game,
          count(*) FILTER (WHERE ebay_photo_url IS NOT NULL AND photo_verdict IS NULL)::int AS todo,
          count(*) FILTER (WHERE photo_verdict = 'good')::int AS good,
          count(*) FILTER (WHERE photo_verdict = 'bad')::int  AS bad
        FROM cards
        GROUP BY game
      `),
    ]);
    return {
      cards: rowsOf<ReviewCard & { game: string }>(cards),
      byGame: rowsOf<{ game: string; todo: number; good: number; bad: number }>(counts),
    };
  });

  if (error) return <Shell><DbErrorBanner error={error} /></Shell>;
  if (!data) return null;

  const { cards, byGame } = data;
  const countsByGame = Object.fromEntries(
    byGame.map((r) => [r.game, { todo: r.todo, good: r.good, bad: r.bad }]),
  );
  const games = orderGames(countsByGame);

  // The tab counts follow the selected pile — "Good 125" beside a One Piece queue
  // of one card would be answering a question nobody asked.
  const scope = game === "all" ? byGame : byGame.filter((r) => r.game === game);
  const counts = scope.reduce(
    (a, r) => ({ todo: a.todo + r.todo, good: a.good + r.good, bad: a.bad + r.bad }),
    { todo: 0, good: 0, bad: 0 },
  );
  const done = counts.good + counts.bad;
  const total = done + counts.todo;
  const gameLabel = game === "all" ? null : GAME_BY_SLUG[game].name;

  const enriched: ReviewCard[] = cards.map((c) => ({
    ...c,
    gameName: isGameSlug(c.game) ? GAME_BY_SLUG[c.game].name : c.game,
    valueLabel: c.value != null ? money(c.value) : null,
    priceLabel: c.listingPrice != null ? money(c.listingPrice) : null,
  }));

  // Both filters live in the URL, so each link keeps the other's choice — picking
  // a game shouldn't silently throw you back to "To review".
  const href = (over: { show?: string; game?: string } = {}) => {
    const s = over.show ?? show;
    const g = over.game ?? game;
    const qs = new URLSearchParams();
    if (s !== "todo") qs.set("show", s);
    if (g !== "all") qs.set("game", g);
    const q = qs.toString();
    return q ? `/admin/photos?${q}` : "/admin/photos";
  };

  return (
    <Shell>
      <GamePicker
        games={games}
        selected={game}
        hrefFor={(g) => href({ game: g })}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl border border-edge bg-panel p-1">
          <Tab href={href({ show: "todo" })} active={show === "todo"}>
            To review <Count n={counts.todo} />
          </Tab>
          <Tab href={href({ show: "good" })} active={show === "good"}>
            Good <Count n={counts.good} />
          </Tab>
          <Tab href={href({ show: "bad" })} active={show === "bad"}>
            Rejected <Count n={counts.bad} />
          </Tab>
        </div>
        <div className="flex items-center gap-4">
          <p className="font-mono text-[11px] tabular-nums text-ink-faint">
            {done} of {total} reviewed
            {total > 0 && ` · ${Math.round((done / total) * 100)}%`}
          </p>
          <RefreshButton />
        </div>
      </div>

      {enriched.length === 0 ? (
        <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-12 text-center text-sm text-ink-dim">
          {show === "todo"
            ? gameLabel
              ? `${gameLabel} is done — every photo in it has a verdict. Pick another pile above.`
              : "Nothing left to review. Every photo has a verdict."
            : `No ${gameLabel ? `${gameLabel} ` : ""}photos ${
                show === "good" ? "approved" : "rejected"
              } yet.`}
        </p>
      ) : (
        <>
          {show === "bad" && (
            <p className="text-xs leading-relaxed text-ink-faint">
              Rejecting cleared the picture and blacklisted it, so the photo job
              can look for a different listing but never that one again. These
              cards show a blank until it finds one.{" "}
              <strong className="font-medium text-ink-dim">Undo</strong>{" "}
              lifts the blacklist — the picture returns on the next{" "}
              <code className="rounded bg-graphite px-1 font-mono text-ink-dim">
                pnpm run photos
              </code>{" "}
              run, not immediately.
            </p>
          )}
          {show === "good" && (
            <p className="text-xs leading-relaxed text-ink-faint">
              These are live on the site, captioned as seller photos. If TCGplayer
              ever publishes real art for one, the next ingest drops the photo and
              this verdict automatically — official art always wins.
            </p>
          )}
          <ReviewGrid cards={enriched} reviewed={show !== "todo"} />
        </>
      )}

      {show === "todo" && counts.todo > PAGE && (
        <p className="text-center font-mono text-[11px] text-ink-faint">
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
        <p className="kicker mb-1">Internal · photo review</p>
        <h1 className="font-display text-2xl font-bold tracking-tight">
          <span className="text-ink">Photo</span>{" "}
          <span className="text-ink-faint">review</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-dim">
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
        active
          ? "bg-panel-hi text-ink"
          : "text-ink-faint hover:bg-panel-hi hover:text-ink-dim"
      }`}
    >
      {children}
    </a>
  );
}

function Count({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-graphite px-1.5 font-mono text-[11px] tabular-nums text-ink-dim">
      {n}
    </span>
  );
}
