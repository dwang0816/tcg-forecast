import { notFound } from "next/navigation";
import {
  GAMES,
  GAME_BY_SLUG,
  isGameSlug,
  parseLanguage,
  hasJapanese,
  Language,
} from "@/lib/games";
import {
  getMovers,
  getMostValuable,
  getGameStats,
  Kind,
  MoverRow,
  ValuableRow,
} from "@/lib/queries";
import { WindowToggle } from "@/components/WindowToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { KindTabs, parseKind } from "@/components/KindTabs";
import { MoversSection } from "@/components/MoversSection";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ValueSection } from "@/components/ValueSection";
import { ViewTabs, View, parseView, isMoversView } from "@/components/ViewTabs";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { formatDate, daysBetween } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return GAMES.map((g) => ({ game: g.slug }));
}

function parseWindow(w: string | undefined): number {
  const n = Number(w);
  return n === 1 || n === 30 ? n : 7;
}

// Sealed rarely trades low, so its noise floor is higher than singles'.
const MIN_PRICE: Record<Kind, number> = { single: 2, sealed: 5 };

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
  const minPrice = MIN_PRICE[kind];

  const q = (
    over: Partial<{ view: View; window: number; lang: Language; kind: Kind }> = {},
  ) =>
    `/${slug}?view=${over.view ?? view}&kind=${over.kind ?? kind}` +
    `&window=${over.window ?? windowDays}&lang=${over.lang ?? language}`;

  // Only load the active tab's data — no point querying lists nobody's looking at.
  const { data, error } = await safeLoad(async () => {
    const stats = await getGameStats(slug, language);
    if (isMoversView(view)) {
      const movers = await getMovers({
        game: slug,
        language,
        kind,
        windowDays,
        direction: view === "gainers" ? "gainers" : "losers",
        limit: 20,
        minPrice,
      });
      return { stats, movers, valuable: [] as ValuableRow[] };
    }
    const valuable = await getMostValuable({
      game: slug,
      language,
      kind,
      limit: view === "valuable" ? 100 : 25,
      basis: view === "valuable" ? "confirmed" : "unconfirmed",
    });
    return { stats, movers: [] as MoverRow[], valuable };
  });

  const what =
    kind === "sealed"
      ? "sealed products"
      : language === "JP"
        ? "Japanese singles"
        : "singles";

  const header = (
    <h1 className="text-2xl font-semibold tracking-tight">
      <span className={game.accentText}>{game.name}</span>{" "}
      <span className="text-white/50">{what}</span>
    </h1>
  );

  if (error || !data) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        {error && <DbErrorBanner error={error} />}
      </div>
    );
  }

  const { stats, movers, valuable } = data;
  const noun = kind === "sealed" ? "sealed products" : "singles";

  const emptyBody =
    stats.daysOfHistory < 2
      ? `We've recorded today's baseline for ${game.name}. Gainers and losers need at least two days of history to compare — they'll appear on the next daily update.`
      : `No ${game.name} ${noun} moved enough over this period (items under $${minPrice} are ignored to cut noise). Try a longer period.`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {header}
        <p className="text-xs text-white/40">
          {stats.cardCount.toLocaleString()} products · data through{" "}
          {formatDate(stats.latestDate)} · {stats.daysOfHistory} day
          {stats.daysOfHistory === 1 ? "" : "s"} tracked
        </p>
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
