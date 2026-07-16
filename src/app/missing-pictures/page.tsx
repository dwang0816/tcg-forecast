import { Suspense } from "react";
import Link from "next/link";
import { GAMES, GAME_BY_SLUG, isGameSlug, GameSlug } from "@/lib/games";
import { getCardsWithoutPicturesCached, getGapCountsCached } from "@/lib/cached";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { money } from "@/lib/format";
import { safeLoad } from "@/lib/safe";

export const metadata = {
  title: "Cards without pictures — TCG Forecast",
  description:
    "Every card we have no picture for, and why. TCGplayer never photographed some sets.",
};

const LIMIT = 500;

/**
 * Public, deliberately.
 *
 * This is a site people quote prices from, so a blank where a card should be
 * needs an explanation the reader can find — otherwise it reads as a bug, or
 * invites us to paper over it with some other card's art, which is exactly the
 * mistake this page exists to prevent.
 */
export default async function MissingPicturesPage({
  searchParams,
}: {
  searchParams: Promise<{ game?: string; show?: string }>;
}) {
  const sp = await searchParams;
  const game = sp.game && isGameSlug(sp.game) ? (sp.game as GameSlug) : undefined;
  const tracked = sp.show !== "all";

  const q = (over: { game?: GameSlug | null; show?: string }) => {
    const g = over.game === null ? undefined : (over.game ?? game);
    const s = over.show ?? (tracked ? "tracked" : "all");
    const parts = [g ? `game=${g}` : "", s === "all" ? "show=all" : ""].filter(Boolean);
    return "/missing-pictures" + (parts.length ? `?${parts.join("&")}` : "");
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Cards without <span className="text-white/50">pictures</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/45">
          TCGplayer never photographed some sets — whole Japanese ones from 2010.
          Where we can, we fall back to another printing from the same set, or a
          photo from a live eBay listing. These are the ones left. We&apos;d rather
          show a blank than someone else&apos;s card.
        </p>
      </div>

      {/* Filters, matching the tab pattern used everywhere else on the site. */}
      <div className="flex flex-wrap items-center gap-4">
        <nav className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <Tab href={q({ game: null })} active={!game}>
            All games
          </Tab>
          {GAMES.map((g) => (
            <Tab key={g.slug} href={q({ game: g.slug })} active={game === g.slug}>
              {g.name}
            </Tab>
          ))}
        </nav>
        <nav className="flex gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
          <Tab href={q({ show: "tracked" })} active={tracked}>
            Tracked
          </Tab>
          <Tab href={q({ show: "all" })} active={!tracked}>
            Everything
          </Tab>
        </nav>
      </div>

      <Suspense key={`${game ?? "all"}-${tracked}`} fallback={<GapsSkeleton />}>
        <Gaps game={game} tracked={tracked} />
      </Suspense>
    </div>
  );
}

function Tab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-white/10 text-white"
          : "text-white/50 hover:bg-white/5 hover:text-white/80"
      }`}
    >
      {children}
    </Link>
  );
}

async function Gaps({ game, tracked }: { game?: GameSlug; tracked: boolean }) {
  const { data, error } = await safeLoad(async () => {
    const [rows, counts] = await Promise.all([
      getCardsWithoutPicturesCached({ game, tracked, limit: LIMIT }),
      getGapCountsCached(game),
    ]);
    return { rows, counts };
  });
  if (error) return <DbErrorBanner error={error} />;
  if (!data) return null;
  const { rows, counts } = data;
  const shown = tracked ? counts.tracked : counts.tracked + counts.untracked;

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat n={counts.tracked} label="Tracked" hint="shown in the site's lists" accent />
        <Stat n={counts.untracked} label="Untracked" hint="only found via search" />
        <Stat
          n={counts.noNumber}
          label="No card number"
          hint="never auto-matched — includes every sealed product"
        />
        <Stat
          n={counts.searched}
          label="Searched eBay"
          hint="no listing we'd trust"
        />
      </div>

      <p className="text-xs leading-relaxed text-white/35">
        A card with <strong className="font-medium text-white/50">no card number</strong>{" "}
        is never matched against eBay automatically: there&apos;s nothing specific
        enough to anchor on, and a guess from the name alone puts the wrong card&apos;s
        photo on the page. Sealed products have no card number by nature, which is why
        the most valuable gap here is a booster box. The rest were searched and turned
        up only graded slabs, multi-card lots, or nothing live at all.
      </p>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-white/40">
          Every card here has a picture. Nothing missing.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/[0.04] text-[11px] uppercase tracking-wide text-white/40">
                <tr>
                  <th className="px-3 py-2.5 font-medium">Number</th>
                  <th className="px-3 py-2.5 font-medium">Card</th>
                  <th className="px-3 py-2.5 font-medium">Rarity</th>
                  <th className="px-3 py-2.5 text-right font-medium">Value</th>
                  <th className="px-3 py-2.5 font-medium">Why</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const g = isGameSlug(r.game) ? GAME_BY_SLUG[r.game] : null;
                  return (
                    <tr
                      key={r.productId}
                      className="border-t border-white/5 transition-colors hover:bg-white/[0.03]"
                    >
                      <td className="whitespace-nowrap px-3 py-2 tabular-nums text-white/60">
                        {r.number ?? <span className="text-white/20">—</span>}
                      </td>
                      <td className="px-3 py-2">
                        <Link
                          href={`/card/${r.productId}`}
                          className="font-medium text-white/85 hover:text-white hover:underline"
                        >
                          {r.name}
                        </Link>
                        {!r.tracked && (
                          <span className="ml-1.5 rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-white/35">
                            untracked
                          </span>
                        )}
                        <div className="mt-0.5 text-xs text-white/35">
                          {g && <span className={g.accentText}>{g.name}</span>}
                          {r.language === "JP" ? " JP" : ""} · {r.groupName}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs text-white/40">
                        {r.rarity ?? "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-white/70">
                        {r.value != null ? money(r.value) : "—"}
                        {r.value != null && !r.confirmed && (
                          <div className="text-[10px] text-white/30">asking</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {r.number == null ? (
                          <span className="whitespace-nowrap rounded-full border border-amber-500/40 bg-amber-500/[0.08] px-2 py-0.5 text-[11px] text-amber-400/90">
                            no card number
                          </span>
                        ) : (
                          <span className="whitespace-nowrap rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-white/40">
                            no eBay match
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-white/35">
            {rows.length < shown
              ? `Showing the ${rows.length} most valuable of ${shown.toLocaleString()}.`
              : `${rows.length.toLocaleString()} ${rows.length === 1 ? "card" : "cards"}, most valuable first.`}
            {counts.value > 0 && ` ${money(counts.value)} of value sits in the tracked ones.`}
          </p>
        </>
      )}
    </div>
  );
}

function Stat({
  n,
  label,
  hint,
  accent,
}: {
  n: number;
  label: string;
  hint: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div
        className={`text-xl font-semibold tabular-nums ${
          accent ? "text-amber-400" : "text-white/85"
        }`}
      >
        {n.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[11px] font-medium text-white/50">{label}</div>
      <div className="mt-0.5 text-[11px] leading-snug text-white/30">{hint}</div>
    </div>
  );
}

function GapsSkeleton() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-[74px] animate-pulse rounded-lg bg-white/[0.04]" />
        ))}
      </div>
      <div className="h-3 w-full max-w-3xl animate-pulse rounded bg-white/[0.04]" />
      <div className="h-96 animate-pulse rounded-xl bg-white/[0.03]" />
    </div>
  );
}
