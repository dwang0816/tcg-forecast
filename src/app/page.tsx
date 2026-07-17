import Link from "next/link";
import { GAMES } from "@/lib/games";
import { getGameSummaryCached } from "@/lib/cached";
import { formatDate } from "@/lib/format";
import { safeLoad } from "@/lib/safe";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { Lockup } from "@/components/Logo";

export default async function Home() {
  const { data: stats, error } = await safeLoad(() =>
    Promise.all(
      GAMES.map(async (g) => ({ game: g, stats: await getGameSummaryCached(g.slug) })),
    ),
  );

  return (
    <div className="flex flex-col gap-14">
      {/* The brand's banner, rebuilt as the hero: grid, rising sparkline, lockup
          centred on top. It's the one place the identity gets to be the content. */}
      <section className="relative -mx-4 overflow-hidden border-y border-edge-warm bg-graphite px-4 py-16 sm:mx-0 sm:rounded-2xl sm:border-x">
        <div
          aria-hidden
          className="absolute inset-0 [background-image:repeating-linear-gradient(0deg,#16161c_0_1px,transparent_1px_44px),repeating-linear-gradient(90deg,#16161c_0_1px,transparent_1px_44px)]"
        />
        <svg
          aria-hidden
          viewBox="0 0 400 100"
          preserveAspectRatio="none"
          className="absolute bottom-0 left-0 h-[45%] w-full opacity-40"
        >
          <polyline
            points="0,80 40,72 80,84 120,60 160,66 200,40 240,50 280,28 320,36 360,14 400,20"
            fill="none"
            stroke="oklch(0.8 0.13 85)"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        <div className="relative flex flex-col items-center gap-7 text-center">
          <Lockup />

          <h1 className="max-w-2xl font-display text-3xl font-bold leading-[1.05] tracking-[-0.02em] text-ink sm:text-[2.75rem]">
            Which cards are <span className="text-up-bright">heating up</span>
            <br className="hidden sm:block" /> and{" "}
            <span className="text-down-bright">cooling off</span>?
          </h1>

          <p className="max-w-lg text-sm leading-relaxed text-ink-dim">
            Daily price movers for Pokémon, One Piece, and Riftbound — the
            biggest gainers and losers, tracked from TCGplayer market data.
          </p>

          <span className="flex items-center gap-2.5" aria-hidden>
            {GAMES.map((g) => (
              <span key={g.slug} className={`h-2 w-2 rounded-full ${g.accent}`} />
            ))}
          </span>
        </div>
      </section>

      {error && <DbErrorBanner error={error} />}

      <section className="flex flex-col gap-4">
        <h2 className="kicker">Pick a market</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {(stats ?? []).map(({ game, stats }) => (
            <Link
              key={game.slug}
              href={`/${game.slug}`}
              className="group relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-edge bg-panel p-6 transition-colors hover:border-gold/40 hover:bg-panel-hi"
            >
              {/* The accent as a hairline along the top edge — the only place a
                  game's colors get more than a dot, and the one spot where
                  they're touching nothing that has to stay readable. */}
              <span
                aria-hidden
                className={`absolute inset-x-0 top-0 h-[3px] opacity-70 transition-opacity group-hover:opacity-100 ${game.accent}`}
              />

              <div className="flex items-center gap-3">
                <span className={`h-2.5 w-2.5 rounded-full ${game.accent}`} />
                <span className="font-display text-lg font-bold tracking-tight text-ink">
                  {game.name}
                </span>
              </div>

              <p className="font-mono text-xs text-ink-dim">
                {stats.cardCount > 0
                  ? `${stats.cardCount.toLocaleString()} cards tracked`
                  : "Awaiting first ingest"}
              </p>
              <p className="font-mono text-[11px] text-ink-faint/70">
                {stats.latestDate
                  ? `Updated ${formatDate(stats.latestDate)}`
                  : "No data yet"}
              </p>

              <span className="mt-2 font-mono text-[11px] uppercase tracking-widest text-ink-faint transition-colors group-hover:text-gold">
                Singles &amp; sealed →
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="kicker">How it works</h2>
        <div className="grid gap-px overflow-hidden rounded-2xl border border-edge bg-edge sm:grid-cols-3">
          <Step
            n="01"
            title="Snapshot daily"
            body="Every day we record the market, low, mid, and high price of every card from TCGplayer's catalog."
          />
          <Step
            n="02"
            title="Compare over time"
            body="We diff today's prices against 24 hours, 7 days, or 30 days ago to find the biggest percentage moves."
          />
          <Step
            n="03"
            title="Surface the movers"
            body="The cards climbing and sinking fastest rise to the top — filtered to real cards over $2 to cut out noise."
          />
        </div>
      </section>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <div className="flex flex-col gap-2 bg-panel p-6">
      <span className="font-mono text-xs font-semibold tracking-[0.2em] text-gold">
        {n}
      </span>
      <h3 className="font-display font-bold tracking-tight text-ink">{title}</h3>
      <p className="text-sm leading-relaxed text-ink-dim">{body}</p>
    </div>
  );
}
