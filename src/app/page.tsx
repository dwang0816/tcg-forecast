import Link from "next/link";
import { GAMES } from "@/lib/games";
import { getGameStats } from "@/lib/queries";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const stats = await Promise.all(
    GAMES.map(async (g) => ({ game: g, stats: await getGameStats(g.slug) })),
  );

  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col items-center gap-4 pt-8 text-center">
        <h1 className="max-w-2xl text-4xl font-semibold tracking-tight sm:text-5xl">
          Which cards are{" "}
          <span className="text-emerald-400">heating up</span> and{" "}
          <span className="text-rose-400">cooling off</span>?
        </h1>
        <p className="max-w-xl text-white/50">
          Daily price movers for Pokémon, One Piece, and Riftbound — the biggest
          gainers and losers, tracked from TCGplayer market data.
        </p>
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {stats.map(({ game, stats }) => (
          <Link
            key={game.slug}
            href={`/${game.slug}`}
            className="group flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/20 hover:bg-white/[0.06]"
          >
            <div className="flex items-center gap-3">
              <span className={`h-3 w-3 rounded-full ${game.accent}`} />
              <span className="text-lg font-semibold">{game.name}</span>
            </div>
            <p className="text-sm text-white/40">
              {stats.cardCount > 0
                ? `${stats.cardCount.toLocaleString()} cards tracked`
                : "Awaiting first ingest"}
            </p>
            <p className="text-xs text-white/30">
              {stats.latestDate
                ? `Updated ${formatDate(stats.latestDate)}`
                : "No data yet"}
            </p>
            <span className="mt-2 text-sm font-medium text-white/60 group-hover:text-white">
              View movers →
            </span>
          </Link>
        ))}
      </section>

      <section className="grid gap-6 rounded-2xl border border-white/10 bg-white/[0.02] p-8 sm:grid-cols-3">
        <Step
          n="1"
          title="Snapshot daily"
          body="Every day we record the market, low, mid, and high price of every card from TCGplayer's catalog."
        />
        <Step
          n="2"
          title="Compare over time"
          body="We diff today's prices against 24 hours, 7 days, or 30 days ago to find the biggest percentage moves."
        />
        <Step
          n="3"
          title="Surface the movers"
          body="The cards climbing and sinking fastest rise to the top — filtered to real cards over $2 to cut out noise."
        />
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-sm font-semibold">
        {n}
      </span>
      <h3 className="font-medium">{title}</h3>
      <p className="text-sm text-white/40">{body}</p>
    </div>
  );
}
