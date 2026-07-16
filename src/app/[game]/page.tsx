import { Suspense } from "react";
import { notFound } from "next/navigation";
import {
  GAMES,
  GAME_BY_SLUG,
  isGameSlug,
  parseLanguage,
  hasJapanese,
  Game,
  Language,
} from "@/lib/games";
import { Kind } from "@/lib/queries";
import {
  getMoversCached,
  getMostValuableCached,
  getGameStatsCached,
} from "@/lib/cached";
import { WindowToggle } from "@/components/WindowToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { KindTabs, parseKind } from "@/components/KindTabs";
import { MoversSection } from "@/components/MoversSection";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ValueSection } from "@/components/ValueSection";
import { ViewTabs, View, parseView, isMoversView } from "@/components/ViewTabs";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { StatsLineSkeleton, ViewSkeleton } from "@/components/Skeletons";
import { formatDate, daysBetween } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export function generateStaticParams() {
  return GAMES.map((g) => ({ game: g.slug }));
}

function parseWindow(w: string | undefined): number {
  const n = Number(w);
  return n === 1 || n === 30 ? n : 7;
}

// Sealed rarely trades low, so its noise floor is higher than singles'.
const MIN_PRICE: Record<Kind, number> = { single: 2, sealed: 5 };

/**
 * The "N products · data through … · N days tracked" line.
 *
 * Its own component behind its own Suspense boundary because it needs
 * daysOfHistory, which means touching the snapshot history — noticeably slower
 * than the lists beside it, and not worth making the tabs wait on.
 */
async function StatsLine({
  slug,
  language,
}: {
  slug: string;
  language: Language;
}) {
  const { data: stats } = await safeLoad(() =>
    getGameStatsCached(slug as never, language),
  );
  if (!stats) return null;
  return (
    <p className="text-xs text-white/40">
      {stats.cardCount.toLocaleString()} products · data through{" "}
      {formatDate(stats.latestDate)} · {stats.daysOfHistory} day
      {stats.daysOfHistory === 1 ? "" : "s"} tracked
    </p>
  );
}

/**
 * The actual list for whichever tab is selected.
 *
 * Everything that touches the database lives in here, so the page shell above can
 * render and the tabs can repaint before a single row is read. Only the tab's own
 * data is loaded — no point querying lists nobody is looking at.
 */
async function ViewContent({
  slug,
  game,
  view,
  kind,
  windowDays,
  language,
}: {
  slug: string;
  game: Game;
  view: View;
  kind: Kind;
  windowDays: number;
  language: Language;
}) {
  const minPrice = MIN_PRICE[kind];
  const noun = kind === "sealed" ? "sealed products" : "singles";

  const { data, error } = await safeLoad(async () => {
    if (isMoversView(view)) {
      const movers = await getMoversCached({
        game: slug as never,
        language,
        kind,
        windowDays,
        direction: view === "gainers" ? "gainers" : "losers",
        limit: 20,
        minPrice,
      });
      // Only needed for the empty state's wording, and only when there's nothing
      // to show — don't make a populated list wait on it.
      const days =
        movers.length === 0
          ? (await getGameStatsCached(slug as never, language)).daysOfHistory
          : Infinity;
      return { movers, valuable: [], days };
    }
    const valuable = await getMostValuableCached({
      game: slug as never,
      language,
      kind,
      limit: view === "valuable" ? 100 : 25,
      basis: view === "valuable" ? "confirmed" : "unconfirmed",
    });
    return { movers: [], valuable, days: Infinity };
  });

  if (error || !data) return error ? <DbErrorBanner error={error} /> : null;
  const { movers, valuable, days } = data;

  const emptyBody =
    days < 2
      ? `We've recorded today's baseline for ${game.name}. Gainers and losers need at least two days of history to compare — they'll appear on the next daily update.`
      : `No ${game.name} ${noun} moved enough over this period (items under $${minPrice} are ignored to cut noise). Try a longer period.`;

  return (
    <div className="flex flex-col gap-5">
      {isMoversView(view) && (
        <MethodologyNote
          windowDays={windowDays}
          actualDays={
            movers.length > 0
              ? daysBetween(movers[0].prevDate, movers[0].latestDate)
              : undefined
          }
          minPrice={minPrice}
          fromDate={movers.length > 0 ? formatDate(movers[0].prevDate) : undefined}
          toDate={movers.length > 0 ? formatDate(movers[0].latestDate) : undefined}
          example={
            movers.length > 0
              ? {
                  name: movers[0].name,
                  from: movers[0].prevPrice,
                  to: movers[0].curPrice,
                  pct: movers[0].pctChange,
                }
              : undefined
          }
        />
      )}

      {view === "gainers" && (
        <MoversSection
          title="▲ Top 20 Gainers"
          rows={movers}
          windowDays={windowDays}
          emptyBody={emptyBody}
        />
      )}
      {view === "losers" && (
        <MoversSection
          title="▼ Top 20 Losers"
          rows={movers}
          windowDays={windowDays}
          emptyBody={emptyBody}
        />
      )}
      {view === "valuable" && (
        <ValueSection
          title={kind === "sealed" ? "★ Most Valuable Sealed" : "★ Most Valuable"}
          subtitle={`Ranked by confirmed TCGplayer market price — ${noun} that actually sell at this level.`}
          rows={valuable}
          emptyBody={`No ${game.name} ${noun} with a confirmed market price yet.`}
        />
      )}
      {view === "unconfirmed" && (
        <ValueSection
          title="◇ Unconfirmed — asking price only"
          subtitle="Nobody has bought one of these on TCGplayer, so there's no market price. These are seller asking prices, which can be pure fantasy — kept separate so they don't distort the ranking."
          rows={valuable}
          tone="warning"
          emptyBody={`Every tracked ${game.name} ${noun} has a confirmed market price — nothing unconfirmed here.`}
        />
      )}
    </div>
  );
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{
    view?: string;
    window?: string;
    lang?: string;
    kind?: string;
  }>;
}) {
  const { game: slug } = await params;
  if (!isGameSlug(slug)) notFound();

  const sp = await searchParams;
  const view = parseView(sp.view);
  const kind = parseKind(sp.kind);
  const windowDays = parseWindow(sp.window);
  const game = GAME_BY_SLUG[slug];
  // Fall back to EN for games with no Japanese catalog on TCGplayer.
  const language: Language = hasJapanese(game) ? parseLanguage(sp.lang) : "EN";

  const q = (
    over: Partial<{ view: View; window: number; lang: Language; kind: Kind }> = {},
  ) =>
    `/${slug}?view=${over.view ?? view}&kind=${over.kind ?? kind}` +
    `&window=${over.window ?? windowDays}&lang=${over.lang ?? language}`;

  const what =
    kind === "sealed"
      ? "sealed products"
      : language === "JP"
        ? "Japanese singles"
        : "singles";

  // Nothing above the Suspense boundaries touches the database, so switching tabs
  // repaints the header and tabs immediately and only the list streams in.
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          <span className={game.accentText}>{game.name}</span>{" "}
          <span className="text-white/50">{what}</span>
        </h1>
        <Suspense fallback={<StatsLineSkeleton />}>
          <StatsLine slug={slug} language={language} />
        </Suspense>
      </div>

      <KindTabs kind={kind} makeHref={(k) => q({ kind: k })} />

      <ViewTabs
        view={view}
        makeHref={(v) => q({ view: v })}
        sealed={kind === "sealed"}
      />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {isMoversView(view) && (
          <WindowToggle windowDays={windowDays} makeHref={(d) => q({ window: d })} />
        )}
        {hasJapanese(game) && (
          <LanguageToggle language={language} makeHref={(l) => q({ lang: l })} />
        )}
      </div>

      {/* The key matters: without it React reuses the boundary across tab changes
          and holds the OLD list on screen while the new one loads, which is the
          "nothing happened when I clicked" feeling. Keyed, each tab gets a fresh
          boundary and its skeleton shows instantly. */}
      <Suspense
        key={`${view}-${kind}-${windowDays}-${language}`}
        fallback={<ViewSkeleton withMethodology={isMoversView(view)} />}
      >
        <ViewContent
          slug={slug}
          game={game}
          view={view}
          kind={kind}
          windowDays={windowDays}
          language={language}
        />
      </Suspense>
    </div>
  );
}
