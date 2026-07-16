import { notFound } from "next/navigation";
import { GAMES, GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import {
  getMovers,
  getMostValuable,
  getGameStats,
  MoverRow,
  ValuableRow,
} from "@/lib/queries";
import { Controls, View } from "@/components/Controls";
import { CardTile } from "@/components/CardTile";
import { formatDate, daysBetween } from "@/lib/format";

export const dynamic = "force-dynamic";

export function generateStaticParams() {
  return GAMES.map((g) => ({ game: g.slug }));
}

function parseView(v: string | undefined): View {
  return v === "losers" || v === "valuable" ? v : "gainers";
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

  const stats = await getGameStats(slug);

  let movers: MoverRow[] = [];
  let valuable: ValuableRow[] = [];
  if (view === "valuable") {
    valuable = await getMostValuable(slug, 48);
  } else {
    movers = await getMovers({ game: slug, windowDays, direction: view });
  }

  // Real period covered (may be shorter than requested while history builds).
  const actualDays =
    movers.length > 0
      ? daysBetween(movers[0].prevDate, movers[0].latestDate)
      : windowDays;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            <span className={game.accentText}>{game.name}</span>{" "}
            <span className="text-white/50">price movers</span>
          </h1>
          <p className="text-xs text-white/40">
            {stats.cardCount.toLocaleString()} cards · data through{" "}
            {formatDate(stats.latestDate)} · {stats.daysOfHistory} day
            {stats.daysOfHistory === 1 ? "" : "s"} tracked
          </p>
        </div>

        <Controls game={slug} view={view} windowDays={windowDays} />
      </div>

      {view === "valuable" ? (
        valuable.length > 0 ? (
          <Grid>
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
          </Grid>
        ) : (
          <EmptyState
            title="No price data yet"
            body="Run an ingest to pull the latest prices for this game."
          />
        )
      ) : movers.length > 0 ? (
        <>
          <p className="-mt-2 text-sm text-white/40">
            Biggest {view === "gainers" ? "gainers" : "losers"} over{" "}
            {actualDays} day{actualDays === 1 ? "" : "s"} (
            {formatDate(movers[0].prevDate)} → {formatDate(movers[0].latestDate)}
            ), market price ≥ $2.
          </p>
          <Grid>
            {movers.map((row, i) => (
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
                change={{ pct: row.pctChange, abs: row.absChange }}
              />
            ))}
          </Grid>
        </>
      ) : (
        <EmptyState
          title={
            stats.daysOfHistory < 2
              ? "Baseline captured — check back tomorrow"
              : "Nothing crossed the threshold"
          }
          body={
            stats.daysOfHistory < 2
              ? `We've recorded today's prices for ${game.name}. Movers need at least two days of history to compare against, so gainers and losers will appear on the next daily update.`
              : `No ${game.name} cards moved enough over this period to report (we ignore cards under $2 to cut noise). Try a longer period or the “Most Valuable” view.`
          }
        />
      )}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
      {children}
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
      <h2 className="text-lg font-medium text-white/80">{title}</h2>
      <p className="max-w-md text-sm text-white/40">{body}</p>
    </div>
  );
}
