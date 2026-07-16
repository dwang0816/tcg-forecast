import { notFound } from "next/navigation";
import { GAMES, GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { getMovers, getMostValuable, getGameStats } from "@/lib/queries";
import { WindowToggle } from "@/components/WindowToggle";
import { MoversSection } from "@/components/MoversSection";
import { CardTile } from "@/components/CardTile";
import { formatDate } from "@/lib/format";

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
  searchParams: Promise<{ window?: string }>;
}) {
  const { game: slug } = await params;
  if (!isGameSlug(slug)) notFound();

  const sp = await searchParams;
  const windowDays = parseWindow(sp.window);
  const game = GAME_BY_SLUG[slug];

  const [stats, gainers, losers, valuable] = await Promise.all([
    getGameStats(slug),
    getMovers({ game: slug, kind: "single", windowDays, direction: "gainers", limit: 20 }),
    getMovers({ game: slug, kind: "single", windowDays, direction: "losers", limit: 20 }),
    getMostValuable({ game: slug, kind: "single", limit: 10 }),
  ]);

  const emptyBody =
    stats.daysOfHistory < 2
      ? `We've recorded today's baseline for ${game.name}. Gainers and losers need at least two days of history to compare — they'll appear on the next daily update.`
      : `No ${game.name} singles moved enough over this period (cards under $2 are ignored to cut noise). Try a longer period.`;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className={game.accentText}>{game.name}</span>{" "}
            <span className="text-white/50">singles</span>
          </h1>
          <p className="text-xs text-white/40">
            {stats.cardCount.toLocaleString()} products · data through{" "}
            {formatDate(stats.latestDate)} · {stats.daysOfHistory} day
            {stats.daysOfHistory === 1 ? "" : "s"} tracked
          </p>
        </div>
        <WindowToggle
          windowDays={windowDays}
          makeHref={(d) => `/${slug}?window=${d}`}
        />
      </div>

      <MoversSection
        title="▲ Top 20 Gainers"
        rows={gainers}
        windowDays={windowDays}
        emptyBody={emptyBody}
      />
      <MoversSection
        title="▼ Top 20 Losers"
        rows={losers}
        windowDays={windowDays}
        emptyBody={emptyBody}
      />

      {valuable.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="border-b border-white/10 pb-2">
            <h2 className="text-lg font-semibold">★ Most Valuable</h2>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {valuable.map((row, i) => (
              <CardTile
                key={`${row.productId}-${row.subTypeName}`}
                rank={i + 1}
                name={row.name}
                groupName={row.groupName}
                imageUrl={row.imageUrl}
                url={row.url}
                subTypeName={row.subTypeName}
                rarity={row.rarity}
                number={row.number}
                price={row.curPrice}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
