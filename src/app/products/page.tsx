import {
  getMovers,
  getMostValuable,
  getGameStats,
  MoverRow,
  ValuableRow,
} from "@/lib/queries";
import { WindowToggle } from "@/components/WindowToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { parseLanguage, Language } from "@/lib/games";
import { MoversSection } from "@/components/MoversSection";
import { MethodologyNote } from "@/components/MethodologyNote";
import { ValueSection } from "@/components/ValueSection";
import { ViewTabs, View, parseView, isMoversView } from "@/components/ViewTabs";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { formatDate, daysBetween } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export const dynamic = "force-dynamic";

function parseWindow(w: string | undefined): number {
  const n = Number(w);
  return n === 1 || n === 30 ? n : 7;
}

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; window?: string; lang?: string }>;
}) {
  const sp = await searchParams;
  const view = parseView(sp.view);
  const windowDays = parseWindow(sp.window);
  const language: Language = parseLanguage(sp.lang);

  const q = (over: Partial<{ view: View; window: number; lang: Language }> = {}) =>
    `/products?view=${over.view ?? view}&window=${over.window ?? windowDays}&lang=${over.lang ?? language}`;
  const href = (v: View) => q({ view: v });

  // Sealed products across ALL games. minPrice raised — sealed rarely trades low.
  const { data, error } = await safeLoad(async () => {
    const stats = await getGameStats(undefined, language);
    if (isMoversView(view)) {
      const movers = await getMovers({
        language,
        kind: "sealed",
        windowDays,
        direction: view === "gainers" ? "gainers" : "losers",
        limit: 20,
        minPrice: 5,
      });
      return { stats, movers, valuable: [] as ValuableRow[] };
    }
    const valuable = await getMostValuable({
      language,
      kind: "sealed",
      limit: view === "valuable" ? 100 : 25,
      basis: view === "valuable" ? "confirmed" : "unconfirmed",
    });
    return { stats, movers: [] as MoverRow[], valuable };
  });

  const header = (
    <h1 className="text-2xl font-semibold tracking-tight">
      Sealed products <span className="text-white/50">· all games</span>
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
      ? "We've recorded today's baseline. Sealed-product gainers and losers need at least two days of history — they'll appear on the next daily update."
      : "No sealed products moved enough over this period (items under $5 are ignored). Try a longer period.";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {header}
        <p className="text-xs text-white/40">
          {language === "JP" ? "Pokémon Japan" : "Pokémon · One Piece · Riftbound"} · data through{" "}
          {formatDate(stats.latestDate)}
        </p>
      </div>

      <ViewTabs view={view} makeHref={href} sealed />

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {isMoversView(view) && (
          <WindowToggle windowDays={windowDays} makeHref={(d) => q({ window: d })} />
        )}
        <LanguageToggle language={language} makeHref={(l) => q({ lang: l })} />
      </div>

      {isMoversView(view) && (
        <MethodologyNote
          windowDays={windowDays}
          actualDays={
            movers.length > 0
              ? daysBetween(movers[0].prevDate, movers[0].latestDate)
              : undefined
          }
          minPrice={5}
          fromDate={movers.length > 0 ? formatDate(movers[0].prevDate) : undefined}
          toDate={movers.length > 0 ? formatDate(movers[0].latestDate) : undefined}
        />
      )}

      {view === "gainers" && (
        <MoversSection
          title="▲ Top 20 Products Rising"
          rows={movers}
          windowDays={windowDays}
          showGameBadge
          emptyBody={emptyBody}
        />
      )}
      {view === "losers" && (
        <MoversSection
          title="▼ Top 20 Products Falling"
          rows={movers}
          windowDays={windowDays}
          showGameBadge
          emptyBody={emptyBody}
        />
      )}
      {view === "valuable" && (
        <ValueSection
          title="★ Most Valuable Sealed"
          subtitle="Ranked by confirmed TCGplayer market price — products that actually sell at this level."
          rows={valuable}
        />
      )}
      {view === "unconfirmed" && (
        <ValueSection
          title="◇ Unconfirmed — asking price only"
          subtitle="No confirmed TCGplayer sales for these, so all we have is a seller's asking price. Kept separate so they don't distort the ranking."
          rows={valuable}
          tone="warning"
        />
      )}
    </div>
  );
}
