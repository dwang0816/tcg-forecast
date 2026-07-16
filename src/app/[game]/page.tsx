import { notFound } from "next/navigation";
import { GAMES, GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import {
  getMovers,
  getMostValuable,
  getGameStats,
  MoverRow,
  ValuableRow,
} from "@/lib/queries";
import { WindowToggle } from "@/components/WindowToggle";
import { MoversSection } from "@/components/MoversSection";
import { ValueSection } from "@/components/ValueSection";
import { ViewTabs, View, parseView, isMoversView } from "@/components/ViewTabs";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { formatDate } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return GAMES.map((g) => ({ game: g.slug }));
}

function parseWindow(w: string | undefined): number {
  const n = Number(w);
  return n === 1 || n === 30 ? n : 7;
}

export default async function GamePage({
  params,
  searchParams,
}: {
  params: Promise<{ game: string }>;
  searchParams: Promise<{ view?: string; window?: string }>;
}) {
  const { game: slug } = await params;
  if (!isGameSlug(slug)) notFound();

  const sp = await searchParams;
  const view = parseView(sp.view);
  const windowDays = parseWindow(sp.window);
  const game = GAME_BY_SLUG[slug];

  const href = (v: View) => `/${slug}?view=${v}&window=${windowDays}`;

  // Only load the active tab's data — no point querying lists nobody's looking at.
  const { data, error } = await safeLoad(async () => {
    const stats = await getGameStats(slug);
    if (isMoversView(view)) {
      const movers = await getMovers({
        game: slug,
        kind: "single",
        windowDays,
        direction: view === "gainers" ? "gainers" : "losers",
        limit: 20,
      });
      return { stats, movers, valuable: [] as ValuableRow[] };
    }
    const valuable = await getMostValuable({
      game: slug,
      kind: "single",
      limit: view === "valuable" ? 100 : 25,
      basis: view === "valuable" ? "confirmed" : "unconfirmed",
    });
    return { stats, movers: [] as MoverRow[], valuable };
  });

  const header = (
    <h1 className="text-2xl font-semibold tracking-tight">
      <span className={game.accentText}>{game.name}</span>{" "}
      <span className="text-white/50">singles</span>
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

  const emptyBody =
    stats.daysOfHistory < 2
      ? `We've recorded today's baseline for ${game.name}. Gainers and losers need at least two days of history to compare — they'll appear on the next daily update.`
      : `No ${game.name} singles moved enough over this period (cards under $2 are ignored to cut noise). Try a longer period.`;

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

      <ViewTabs view={view} makeHref={href} />

      {isMoversView(view) && (
        <WindowToggle
          windowDays={windowDays}
          makeHref={(d) => `/${slug}?view=${view}&window=${d}`}
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
          title="★ Most Valuable"
          subtitle="Ranked by confirmed TCGplayer market price — cards that actually sell at this level."
          rows={valuable}
        />
      )}
      {view === "unconfirmed" && (
        <ValueSection
          title="◇ Unconfirmed — asking price only"
          subtitle="Nobody has bought one of these on TCGplayer, so there's no market price. These are seller asking prices, which can be pure fantasy — kept separate so they don't distort the ranking."
          rows={valuable}
          tone="warning"
        />
      )}
    </div>
  );
}
