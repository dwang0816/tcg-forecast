import Link from "next/link";
import { searchCards } from "@/lib/queries";
import { GAMES, isGameSlug, GameSlug, parseLanguage, Language } from "@/lib/games";
import { ValueCard } from "@/components/ValueCard";
import { SearchBox } from "@/components/SearchBox";
import { DbErrorBanner } from "@/components/DbErrorBanner";
import { safeLoad } from "@/lib/safe";

export const dynamic = "force-dynamic";

const PAGE = 60;

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    game?: string;
    lang?: string;
    kind?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const game = sp.game && isGameSlug(sp.game) ? (sp.game as GameSlug) : undefined;
  const language: Language | undefined = sp.lang ? parseLanguage(sp.lang) : undefined;
  const kind = sp.kind === "sealed" ? "sealed" : sp.kind === "single" ? "single" : undefined;
  const page = Math.max(1, Number(sp.page) || 1);

  const { data, error } = await safeLoad(() =>
    searchCards({ q, game, language, kind, limit: PAGE, offset: (page - 1) * PAGE }),
  );

  const href = (over: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { q, game, lang: language, kind, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, String(v));
    return `/search?${p.toString()}`;
  };

  const chip = (active: boolean) =>
    `rounded-full px-3 py-2 text-xs font-medium transition-colors ${
      active ? "bg-white text-black" : "bg-panel text-ink-dim hover:bg-panel-hi hover:text-ink"
    }`;

  const total = data?.total ?? 0;
  const pages = Math.ceil(total / PAGE);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Look up a card</h1>
        <p className="mt-1 text-sm text-ink-faint">
          Find any single card or sealed product to see its price, price history
          and card details. Search by anything on the card — name, set, rarity or
          number — and the words can come from different fields: &ldquo;cleffa
          obsidian&rdquo;, &ldquo;charizard illustration rare&rdquo;, &ldquo;OP01-024&rdquo;.
        </p>
      </div>

      <SearchBox defaultValue={q} autoFocus />

      {/* One filter row above everything it scopes. */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-ink-faint/70">Game</span>
          <Link href={href({ game: undefined, page: undefined })} className={chip(!game)}>All</Link>
          {GAMES.map((g) => (
            <Link key={g.slug} href={href({ game: g.slug, page: undefined })} className={chip(game === g.slug)}>
              {g.name}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-ink-faint/70">Type</span>
          <Link href={href({ kind: undefined, page: undefined })} className={chip(!kind)}>All</Link>
          <Link href={href({ kind: "single", page: undefined })} className={chip(kind === "single")}>Singles</Link>
          <Link href={href({ kind: "sealed", page: undefined })} className={chip(kind === "sealed")}>Sealed</Link>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-ink-faint/70">Language</span>
          <Link href={href({ lang: undefined, page: undefined })} className={chip(!language)}>All</Link>
          <Link href={href({ lang: "EN", page: undefined })} className={chip(language === "EN")}>EN</Link>
          <Link href={href({ lang: "JP", page: undefined })} className={chip(language === "JP")}>JP</Link>
        </div>
      </div>

      {error && <DbErrorBanner error={error} />}

      {!q && (
        <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-12 text-center text-sm text-ink-faint">
          Search all 71,000+ cards. Mix any keywords you like — card name, set,
          rarity, number — e.g. &ldquo;cleffa obsidian&rdquo; or &ldquo;luffy manga&rdquo;.
        </p>
      )}

      {q && data && (
        <>
          <div className="flex items-baseline justify-between border-b border-edge pb-2">
            <h2 className="text-sm font-medium text-ink-dim">
              {data.fuzzy ? (
                <>
                  No exact match for{" "}
                  <span className="text-ink">&ldquo;{q}&rdquo;</span> — showing{" "}
                  {total} similar
                </>
              ) : (
                <>
                  {total.toLocaleString()} result{total === 1 ? "" : "s"} for{" "}
                  <span className="text-ink">&ldquo;{q}&rdquo;</span>
                </>
              )}
            </h2>
            {pages > 1 && (
              <span className="text-xs text-ink-faint">page {page} of {pages}</span>
            )}
          </div>

          {data.rows.length === 0 ? (
            <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-12 text-center text-sm text-ink-faint">
              Nothing matched. Try a shorter name, or the card number (e.g. OP01-024).
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
              {data.rows.map((row) => (
                <ValueCard key={row.productId} row={row} />
              ))}
            </div>
          )}

          {pages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              {page > 1 && (
                <Link href={href({ page: String(page - 1) })} className={chip(false)}>← Previous</Link>
              )}
              {page < pages && (
                <Link href={href({ page: String(page + 1) })} className={chip(false)}>Next →</Link>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
