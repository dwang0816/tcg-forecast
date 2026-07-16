import { getMovers, getGameStats } from "@/lib/queries";
import { WindowToggle } from "@/components/WindowToggle";
import { MoversSection } from "@/components/MoversSection";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function parseWindow(w: string | undefined): number {
  const n = Number(w);
  return n === 1 || n === 30 ? n : 7;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ window?: string }>;
}) {
  const sp = await searchParams;
  const windowDays = parseWindow(sp.window);

  // Sealed products across ALL games. minPrice raised — sealed rarely trades low.
  const [stats, gainers, losers] = await Promise.all([
    getGameStats(),
    getMovers({ kind: "sealed", windowDays, direction: "gainers", limit: 20, minPrice: 5 }),
    getMovers({ kind: "sealed", windowDays, direction: "losers", limit: 20, minPrice: 5 }),
  ]);

  const emptyBody =
    stats.daysOfHistory < 2
      ? "We've recorded today's baseline. Sealed-product gainers and losers need at least two days of history — they'll appear on the next daily update."
      : "No sealed products moved enough over this period (items under $5 are ignored). Try a longer period.";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">
            Sealed products{" "}
            <span className="text-white/50">· all games</span>
          </h1>
          <p className="text-xs text-white/40">
            Pokémon · One Piece · Riftbound · data through{" "}
            {formatDate(stats.latestDate)}
          </p>
        </div>
        <WindowToggle
          windowDays={windowDays}
          makeHref={(d) => `/products?window=${d}`}
        />
      </div>

      <MoversSection
        title="▲ Top 20 Products Rising"
        rows={gainers}
        windowDays={windowDays}
        showGameBadge
        emptyBody={emptyBody}
      />
      <MoversSection
        title="▼ Top 20 Products Falling"
        rows={losers}
        windowDays={windowDays}
        showGameBadge
        emptyBody={emptyBody}
      />
    </div>
  );
}
