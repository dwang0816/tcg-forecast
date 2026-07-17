import { Suspense } from "react";
import Link from "next/link";
import { GAMES, GAME_BY_SLUG, isGameSlug, GameSlug } from "@/lib/games";
import { getCardsWithoutPicturesCached, getGapCountsCached } from "@/lib/cached";
import { getCardsWithoutPictures } from "@/lib/queries";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { SearchBox } from "@/components/SearchBox";
import { money } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export const metadata = {
  title: "Cards without pictures — TCG Forecast",
  description:
    "Every card we have no picture for, and why. TCGplayer never photographed some sets.",
};

const LIMIT = 500;

/**
 * Public, deliberately.
 *
 * This is a site people quote prices from, so a blank where a card should be
 * needs an explanation the reader can find — otherwise it reads as a bug, or
 * invites us to paper over it with some other card's art, which is exactly the
 * mistake this page exists to prevent.
 */
export default async function MissingPicturesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; show?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const game = sp.game && isGameSlug(sp.game) ? (sp.game as GameSlug) : undefined;
  const tracked = sp.show !== "all";
  const term = (sp.q ?? "").trim();

  // Filter links keep the active search — switching game mid-search shouldn't
  // silently throw the query away.
  const href = (over: { game?: GameSlug | null; show?: string; q?: string | null }) => {
    const g = over.game === null ? undefined : (over.game ?? game);
    const s = over.show ?? (tracked ? "tracked" : "all");
    const t = over.q === null ? "" : (over.q ?? term);
    const p = new URLSearchParams();
    if (g) p.set("game", g);
    if (s === "all") p.set("show", "all");
    if (t) p.set("q", t);
    const qs = p.toString();
    return "/missing-pictures" + (qs ? `?${qs}` : "");
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cards without <span className="text-ink-dim">pictures</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-faint">
          TCGplayer never photographed some sets — whole Japanese ones from 2010.
          Where we can, we fall back to another printing from the same set, or a
          photo from a live eBay listing. These are the ones left. We&apos;d rather
          show a blank than someone else&apos;s card.
        </p>
      </div>

      {/* Filters, matching the tab pattern used everywhere else on the site. */}
      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex flex-wrap gap-1 rounded-xl border border-edge bg-panel p-1">
          <Tab href={href({ game: null })} active={!game}>
            All games
          </Tab>
          {GAMES.map((g) => (
            <Tab key={g.slug} href={href({ game: g.slug })} active={game === g.slug}>
              {g.name}
            </Tab>
          ))}
        </nav>
        <nav className="flex flex-wrap gap-1 rounded-xl border border-edge bg-panel p-1">
          <Tab href={href({ show: "tracked" })} active={tracked}>
            Tracked
          </Tab>
          <Tab href={href({ show: "all" })} active={!tracked}>
            Everything
          </Tab>
        </nav>
      </div>

      {/* Searching the query, not the rendered rows: the table is capped at the
          500 most valuable, so a client-side filter would only ever find a card
          already on screen — useless on a list this long. */}
      <SearchBox
        action="/missing-pictures"
        defaultValue={term}
        placeholder="Search these cards — name, set, rarity or number"
        hidden={{
          ...(game ? { game } : {}),
          ...(tracked ? {} : { show: "all" }),
        }}
      />

      <Suspense
        key={`${game ?? "all"}-${tracked}-${term}`}
        fallback={<GapsSkeleton />}
      >
        <Gaps game={game} tracked={tracked} term={term} clearHref={href({ q: null })} />
      </Suspense>
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
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "bg-panel-hi text-ink"
          : "text-ink-dim hover:bg-panel hover:text-ink"
      }`}
    >
      {children}
    </Link>
  );
}

async function Gaps({
  game,
  tracked,
  term,
  clearHref,
}: {
  game?: GameSlug;
  tracked: boolean;
  term: string;
  clearHref: string;
}) {
  const { data, error } = await safeLoad(async () => {
    const [gaps, counts] = await Promise.all([
      // Cached only when there's no search term. unstable_cache keys on the
      // arguments, so caching arbitrary typed text would mint a permanent entry
      // per query — which is why searchCards isn't cached either.
      term
        ? getCardsWithoutPictures({ game, tracked, q: term, limit: LIMIT })
        : getCardsWithoutPicturesCached({ game, tracked, limit: LIMIT }),
      getGapCountsCached(game),
    ]);
    return { ...gaps, counts };
  });
  if (error) return <DbErrorBanner error={error} />;
  if (!data) return null;
  const { rows, total, counts } = data;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={counts.tracked} label="Tracked" hint="shown in the site's lists" accent />
        <Stat n={counts.untracked} label="Untracked" hint="only found via search" />
        <Stat
          n={counts.noNumber}
          label="No card number"
          hint="never auto-matched — includes every sealed product"
        />
        <Stat
          n={counts.searched}
          label="Searched eBay"
          hint="no listing we'd trust"
        />
      </div>

      <p className="text-xs leading-relaxed text-ink-faint">
        A card with <strong className="font-medium text-ink-dim">no card number</strong>{" "}
        is never matched against eBay automatically: there&apos;s nothing specific
        enough to anchor on, and a guess from the name alone puts the wrong card&apos;s
        photo on the page. Sealed products have no card number by nature, which is why
        the most valuable gap here is a booster box. The rest were searched and turned
        up only graded slabs, multi-card lots, or nothing live at all.
      </p>

      {term && (
        <div className="flex items-baseline justify-between gap-3 border-b border-edge pb-2">
          <h2 className="text-sm font-medium text-ink-dim">
            {total.toLocaleString()} card{total === 1 ? "" : "s"} without a picture
            match <span className="text-ink">&ldquo;{term}&rdquo;</span>
          </h2>
          <Link
            href={clearHref}
            className="shrink-0 text-xs text-ink-faint hover:text-ink"
          >
            Clear search
          </Link>
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-10 text-center text-sm text-ink-faint">
          {/* The header above already says nothing matched, so this only has to
              explain why and what to do about it. */}
          {term ? (
            <>
              Every word has to appear somewhere on the card. Try just the name, the
              set, or the card number — or{" "}
              <Link href={clearHref} className="text-ink-dim underline hover:text-ink">
                browse all of them
              </Link>
              .
            </>
          ) : (
            "Every card here has a picture. Nothing missing."
          )}
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-edge">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-panel text-[11px] uppercase tracking-wide text-ink-faint">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Number</th>
                  <th className="px-3 py-2.5 font-medium">Card</th>
                  <th className="px-3 py-2.5 font-medium">Rarity</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-3 py-2.5 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = isGameSlug(r.game) ? GAME_BY_SLUG[r.game] : null;
                  return (
                    <tr
                      key={r.productId}
                      className="border-t border-edge transition-colors hover:bg-panel"
                    >
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-ink-dim">
                        {r.number ?? <span className="text-ink-faint/50">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/card/${r.productId}`}
                          className="font-medium text-ink hover:text-ink hover:underline"
                        >
                          {r.name}
                        </Link>
                        {!r.tracked && (
                          <span className="ml-1.5 rounded border border-edge px-1.5 py-0.5 text-[10px] text-ink-faint">
                            untracked
                          </span>
                        )}
                        <div className="mt-0.5 text-xs text-ink-faint">
                          {g && <span className={g.accentText}>{g.name}</span>}
                          {r.language === "JP" ? " JP" : ""} · {r.groupName}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-ink-faint">
                        {r.rarity ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-ink-dim">
                        {r.value != null ? money(r.value) : "—"}
                        {r.value != null && !r.confirmed && (
                          <div className="text-[10px] text-ink-faint/70">asking</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.number == null ? (
                          <span className="whitespace-nowrap rounded-full border border-gold/40 bg-gold/[0.08] px-2 py-0.5 text-[11px] text-gold/90">
                            no card number
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full border border-edge px-2 py-0.5 text-[11px] text-ink-faint">
                            no eBay match
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-ink-faint">
            {rows.length < total
              ? `Showing the ${rows.length} most valuable of ${total.toLocaleString()}${term ? " matches" : ""}.`
              : `${rows.length.toLocaleString()} ${rows.length === 1 ? "card" : "cards"}, most valuable first.`}
            {/* The value total comes from the unsearched counts, so it would be
                answering a question nobody asked next to a filtered table. */}
            {!term &&
              counts.value > 0 &&
              ` ${money(counts.value)} of value sits in the tracked ones.`}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  n,
  label,
  hint,
  accent,
}: {
  n: number;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-edge bg-panel/50 px-3 py-2.5">
      <div
        className={`text-xl font-semibold tabular-nums ${
          accent ? "text-gold" : "text-ink"
        }`}
      >
        {n.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-ink-dim">{label}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-ink-faint/70">{hint}</div>
    </div>
  );
}

function GapsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-lg bg-panel" />
        ))}
      </div>
      <div className="h-3 w-full max-w-3xl animate-pulse rounded bg-panel" />
      <div className="h-96 animate-pulse rounded-xl bg-panel" />
    </div>
  );
}
