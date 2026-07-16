import { notFound } from "next/navigation";
import Link from "next/link";
import { getCard, getCardHistory } from "@/lib/queries";
import { GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { cardImageSources } from "@/lib/images";
import { CardImage } from "@/components/CardImage";
import { PriceChart, Series } from "@/components/PriceChart";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { money, percent, formatDate } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export const dynamic = "force-dynamic";

/** Card text can contain TCGplayer's inline HTML; show it as plain text. */
function stripHtml(v: string): string {
  return v
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .trim();
}

// Long-form fields get their own block; the rest read well as a stat grid.
const PROSE_FIELDS = new Set(["Description", "CardText", "FlavorText", "Flavor Text"]);

export default async function CardPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId: raw } = await params;
  const productId = Number(raw);
  if (!Number.isFinite(productId)) notFound();

  const { data, error } = await safeLoad(async () => {
    const card = await getCard(productId);
    if (!card) return { card: null, history: [] };
    return { card, history: await getCardHistory(productId) };
  });

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <DbErrorBanner error={error} />
      </div>
    );
  }
  if (!data?.card) notFound();

  const { card, history } = data;
  const game = isGameSlug(card.game) ? GAME_BY_SLUG[card.game] : null;
  const sources = cardImageSources({
    game: card.game,
    number: card.number,
    imageUrl: card.imageUrl,
    altImageUrls: card.altImageUrls,
  });

  // Build one series per printing, keeping only days with a real market price.
  const bySub = new Map<string, Series>();
  for (const h of history) {
    if (h.marketPrice == null) continue;
    const s = bySub.get(h.subTypeName) ?? { label: h.subTypeName, points: [] };
    s.points.push({
      date: h.date,
      price: h.marketPrice,
      low: h.lowPrice,
      high: h.highPrice,
    });
    bySub.set(h.subTypeName, s);
  }
  const series = [...bySub.values()].filter((s) => s.points.length > 0);

  // Headline: latest market price, and its change over the window we hold.
  const primary = series.sort((a, b) => b.points.length - a.points.length)[0];
  const latest = primary?.points.at(-1);
  const first = primary?.points[0];
  const change =
    latest && first && first.price > 0
      ? (latest.price - first.price) / first.price
      : null;

  const latestRow = [...history]
    .reverse()
    .find((h) => h.subTypeName === primary?.label);

  const extended = (card.extended ?? []).filter((f) => f.value?.trim());
  const prose = extended.filter((f) => PROSE_FIELDS.has(f.name));
  const stats = extended.filter((f) => !PROSE_FIELDS.has(f.name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-white/40">
        {game && (
          <Link href={`/${game.slug}`} className="hover:text-white/70">
            {game.name}
          </Link>
        )}
        <span>·</span>
        <span>{card.groupName}</span>
        {card.language === "JP" && (
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px]">JP</span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,300px)_1fr]">
        {/* Image */}
        <div className="relative aspect-[5/7] overflow-hidden rounded-2xl border border-white/10 bg-black/30">
          <CardImage sources={sources} alt={card.name} />
          {game && (
            <span
              className={`absolute bottom-3 left-3 rounded-md px-2 py-0.5 text-[11px] font-semibold text-white ${game.accent}`}
            >
              {game.name}
            </span>
          )}
        </div>

        {/* Headline */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {card.name}
            </h1>
            <p className="mt-1 text-sm text-white/45">
              {card.groupName}
              {card.rarity ? ` · ${card.rarity}` : ""}
              {card.number ? ` · ${card.number}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <div>
              <div className="text-xs text-white/40">Market price</div>
              <div className="text-3xl font-semibold text-white">
                {latest ? money(latest.price) : "N/A"}
              </div>
              {!latest && (
                <div className="mt-1 text-xs text-amber-400/80">
                  no confirmed sales — asking price only
                </div>
              )}
            </div>
            {change != null && first && (
              <div>
                <div className="text-xs text-white/40">
                  since {formatDate(first.date)}
                </div>
                <div
                  className={`text-lg font-semibold tabular-nums ${
                    change >= 0 ? "text-emerald-400" : "text-rose-400"
                  }`}
                >
                  {percent(change)}
                </div>
              </div>
            )}
            {latestRow && (
              <div>
                <div className="text-xs text-white/40">Listings</div>
                <div className="text-sm tabular-nums text-white/70">
                  {latestRow.lowPrice != null && latestRow.highPrice != null
                    ? `${money(latestRow.lowPrice)} – ${money(latestRow.highPrice)}`
                    : "—"}
                </div>
                <div className="mt-1">
                  <ConfidenceBadge
                    low={latestRow.lowPrice}
                    high={latestRow.highPrice}
                  />
                </div>
              </div>
            )}
          </div>

          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white"
            >
              Buy on TCGplayer ↗
            </a>
          )}
        </div>
      </div>

      {/* Chart */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-2">
          <h2 className="text-lg font-semibold">Market price over time</h2>
          <span className="text-xs text-white/40">
            {history.length > 0
              ? `daily snapshots · ${formatDate(history[0].date)} → ${formatDate(history[history.length - 1].date)}`
              : "no history yet"}
          </span>
        </div>
        <PriceChart series={series} />
      </section>

      {/* Card data */}
      {(prose.length > 0 || stats.length > 0) && (
        <section className="flex flex-col gap-3">
          <div className="border-b border-white/10 pb-2">
            <h2 className="text-lg font-semibold">Card details</h2>
          </div>

          {stats.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {stats.map((f) => (
                <div
                  key={f.name}
                  className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2"
                >
                  <dt className="text-[11px] uppercase tracking-wide text-white/35">
                    {f.displayName || f.name}
                  </dt>
                  <dd className="mt-0.5 text-sm text-white/80">
                    {stripHtml(f.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {prose.map((f) => (
            <div
              key={f.name}
              className="rounded-lg border border-white/10 bg-white/[0.02] p-4"
            >
              <div className="text-[11px] uppercase tracking-wide text-white/35">
                {f.displayName || f.name}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-white/70">
                {stripHtml(f.value)}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
