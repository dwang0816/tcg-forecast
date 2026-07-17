import { notFound } from "next/navigation";
import Link from "next/link";
import { getCard, getCardHistory, getSiblingPrintings } from "@/lib/queries";
import { GAME_BY_SLUG, isGameSlug } from "@/lib/games";
import { cardImageSources, hasOfficialArt } from "@/lib/images";
import { CardImage } from "@/components/CardImage";
import { SiblingPrintings } from "@/components/SiblingPrintings";
import { PriceChart } from "@/components/PriceChart";
import { CardPriceHeadline, CardPriceFacts } from "@/components/CardPriceStats";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { statsByPrinting } from "@/lib/cardStats";
import { formatDate, money } from "@/lib/format";
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
    if (!card) return { card: null, history: [], siblings: [] };
    // Other printings are a One Piece feature for now — the grouping is
    // game-agnostic, but whether it belongs on a Pokémon/Riftbound page is a
    // separate call, so don't even query it off One Piece.
    const [history, siblings] = await Promise.all([
      getCardHistory(productId),
      card.game === "onepiece" ? getSiblingPrintings(card) : Promise.resolve([]),
    ]);
    return { card, history, siblings };
  });

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <DbErrorBanner error={error} />
      </div>
    );
  }
  if (!data?.card) notFound();

  const { card, history, siblings } = data;
  // A booster box or ETB isn't a "card" — call it what it is. The noun feeds the
  // page's wording (headings, empty states, the picture caption) so a sealed
  // product never gets described as a single.
  const sealed = !card.isSingle;
  const noun = sealed ? "product" : "card";
  const game = isGameSlug(card.game) ? GAME_BY_SLUG[card.game] : null;
  const sources = cardImageSources({
    game: card.game,
    number: card.number,
    imageUrl: card.imageUrl,
    altImageUrls: card.altImageUrls,
    ebayPhotoUrl: card.ebayPhotoUrl,
  });
  // TCGplayer never photographed some cards — whole old Japanese sets. For those
  // the picture is a seller's photo of their own copy, so it gets named as one
  // and linked to the listing. Unlabelled it would read as the card's artwork,
  // and it isn't: it may be sleeved, angled, or (for two-part LEGEND cards) show
  // both halves on someone's table.
  const listingPhoto = !hasOfficialArt(card) && Boolean(card.ebayPhotoUrl);

  // Keep every day, including ones with no sale: a gap in the market price IS
  // the signal on a thin card, and the asking band still has something to say.
  const series = statsByPrinting(history);
  const primary = series[0] ?? null;

  const extended = (card.extended ?? []).filter((f) => f.value?.trim());
  const prose = extended.filter((f) => PROSE_FIELDS.has(f.name));
  const stats = extended.filter((f) => !PROSE_FIELDS.has(f.name));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
        {game && (
          <Link href={`/${game.slug}`} className="hover:text-ink-dim">
            {game.name}
          </Link>
        )}
        <span>·</span>
        <span>{card.groupName}</span>
        {card.language === "JP" && (
          <span className="rounded bg-panel-hi px-1.5 py-0.5 text-[10px]">JP</span>
        )}
        {sealed && (
          <span className="rounded bg-panel-hi px-1.5 py-0.5 text-[10px] font-medium text-ink-dim">
            Sealed product
          </span>
        )}
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,300px)_1fr]">
        {/* Image */}
        <div className="flex flex-col gap-2">
          <div className="relative aspect-[5/7] overflow-hidden rounded-2xl border border-edge bg-graphite">
            <CardImage sources={sources} alt={card.name} />
            {game && (
              <span
                className={`absolute bottom-3 left-3 rounded-md px-2 py-0.5 text-[11px] font-semibold text-ink ${game.accent}`}
              >
                {game.name}
              </span>
            )}
          </div>
          {listingPhoto && (
            <p className="text-[11px] leading-snug text-ink-faint">
              No official picture exists for this {noun}, so this is a photo from a
              live eBay listing
              {card.ebayListingPrice != null ? ` (${money(card.ebayListingPrice)})` : ""}
              , taken by the seller.{" "}
              {card.ebayListingUrl && (
                <a
                  href={card.ebayListingUrl}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="text-ink-dim underline underline-offset-2 hover:text-ink"
                >
                  See the listing ↗
                </a>
              )}
            </p>
          )}

          {siblings.length > 1 && (
            <SiblingPrintings
              printings={siblings}
              currentId={card.productId}
              game={card.game}
            />
          )}
        </div>

        {/* Headline */}
        <div className="flex flex-col gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">
              {card.name}
            </h1>
            <p className="mt-1 text-sm text-ink-faint">
              {card.groupName}
              {card.rarity ? ` · ${card.rarity}` : ""}
              {card.number ? ` · ${card.number}` : ""}
            </p>
          </div>

          {primary ? (
            <CardPriceHeadline s={primary} />
          ) : (
            <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-6 text-sm text-ink-faint">
              We haven&apos;t recorded a price for this one yet. It&apos;ll appear
              after the next daily update.
            </p>
          )}

          {card.url && (
            <a
              href={card.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-fit items-center gap-1.5 rounded-lg border border-edge bg-panel px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-panel-hi hover:text-ink"
            >
              Buy on TCGplayer ↗
            </a>
          )}
        </div>
      </div>

      {/* The at-a-glance strip wants the full width — 4 columns don't fit beside
          the image, and these are the numbers people scan before the chart. */}
      {primary && <CardPriceFacts s={primary} />}

      {/* Chart */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-edge pb-2">
          <h2 className="text-lg font-semibold">Price history</h2>
          <span className="text-xs text-ink-faint">
            {history.length > 0
              ? `daily snapshots · ${formatDate(history[0].date)} → ${formatDate(history[history.length - 1].date)}`
              : "no history yet"}
          </span>
        </div>
        <PriceChart series={series} sealed={sealed} />
      </section>

      {/* Card data */}
      {(prose.length > 0 || stats.length > 0) && (
        <section className="flex flex-col gap-3">
          <div className="border-b border-edge pb-2">
            <h2 className="text-lg font-semibold">
              {sealed ? "Product details" : "Card details"}
            </h2>
          </div>

          {stats.length > 0 && (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {stats.map((f) => (
                <div
                  key={f.name}
                  className="rounded-lg border border-edge bg-panel/50 px-3 py-2"
                >
                  <dt className="text-[11px] uppercase tracking-wide text-ink-faint">
                    {f.displayName || f.name}
                  </dt>
                  <dd className="mt-0.5 text-sm text-ink">
                    {stripHtml(f.value)}
                  </dd>
                </div>
              ))}
            </dl>
          )}

          {prose.map((f) => (
            <div
              key={f.name}
              className="rounded-lg border border-edge bg-panel/50 p-4"
            >
              <div className="text-[11px] uppercase tracking-wide text-ink-faint">
                {f.displayName || f.name}
              </div>
              <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-dim">
                {stripHtml(f.value)}
              </p>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
