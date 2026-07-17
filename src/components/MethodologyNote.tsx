import { money, percent, percentPlain } from "@/lib/format";
import { convictionTier, type MoveScore } from "@/lib/conviction";
import { CONVICTION_STYLES } from "@/components/MoveScoreBadge";

export interface MoverExample {
  name: string;
  from: number;
  to: number;
  pct: number;
}

/**
 * Two real cards from the list below: the one that came first, and the one that
 * moved most — when they aren't the same card.
 *
 * That disagreement is the single most confusing thing about these lists, and
 * until now nothing on the page explained it. "Calm beats wild" hinted that a
 * small % can outrank a big one, but never said the ORDER is % x trust, so a
 * reader seeing +169% sitting below +118% could only conclude the ranking was
 * broken.
 *
 * These carry the real MoveScore rather than the ingredients to rebuild one. An
 * earlier cut passed low/high and re-derived the ranking here with confidenceFactor,
 * which made this file a third copy of the formula — and a copy that quietly went
 * wrong the moment the score grew a term it didn't know about. Now it reports.
 */
export interface RankExample {
  top: { name: string; move: MoveScore };
  biggest: { name: string; move: MoveScore };
}

/**
 * Explains how gains/losses are worked out, above the movers lists.
 *
 * People trade real money off these numbers, so this has to actually land — not
 * just technically exist. It leads with a worked example built from the real top
 * mover on screen, then three plain-sentence rules. The precise stuff (formula,
 * confidence weights, limits) stays available but folded away, so the honest
 * details are there without burying the point.
 */
export function MethodologyNote({
  windowDays,
  actualDays,
  minPrice,
  fromDate,
  toDate,
  example,
  ranking,
}: {
  windowDays: number;
  actualDays?: number;
  minPrice: number;
  fromDate?: string;
  toDate?: string;
  example?: MoverExample;
  ranking?: RankExample;
}) {
  const period = actualDays && actualDays !== windowDays ? actualDays : windowDays;
  const up = example ? example.pct >= 0 : true;

  // Only worth explaining the ordering when this list actually demonstrates it —
  // i.e. the card on top isn't the one that moved most. On a day where they're the
  // same card there's nothing surprising to justify, and the box would be noise.
  const puzzle =
    ranking && ranking.top.name !== ranking.biggest.name ? ranking : null;

  // Which of the two things cost the biggest mover its place — a stale price, or a
  // price nobody agrees on? The old copy always said "spread", because spread was
  // the only term that existed. Now it can be either, so ask rather than assert.
  const lostToPacing = puzzle?.biggest.move.paced;

  return (
    <section className="rounded-2xl border border-edge bg-panel p-5">
      <h3 className="font-display text-base font-bold tracking-tight text-ink">
        How we work out the change
      </h3>
      {/* Name the number before doing anything with it. "The price" begged the
          question people actually have — WHICH price? — and the answer was folded
          away in the math drawer, which is the one place a confused reader won't
          look. */}
      <p className="mt-1 text-sm leading-relaxed text-ink-dim">
        We use TCGplayer&apos;s{" "}
        <strong className="font-semibold text-ink">market price</strong> — what
        the card actually sold for, worked out from real completed sales. Not what
        sellers are asking, and not eBay or Japanese shops. We take that price{" "}
        {period === 1 ? "yesterday" : `${period} days ago`}{" "}
        and compare it with today&apos;s.
      </p>

      {/* A real example, not a made-up one — this is the top card on screen. */}
      {example && (
        <div className="mt-4 rounded-xl bg-graphite p-4">
          <p className="kicker mb-3">
            TCGplayer market price — {example.name}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Stat label={fromDate ?? `${period} days ago`} value={money(example.from)} />
            <span className="text-lg text-ink-faint/60">→</span>
            {/* Today's price wears the direction, matching the tiles below. The
                one it came from doesn't: a past price isn't going anywhere, and
                coloring both would say this card moved twice. */}
            <Stat label={toDate ?? "today"} value={money(example.to)} up={up} />
            <span className="text-lg text-ink-faint/60">=</span>
            <span
              className={`rounded-lg px-3 py-2 font-mono text-lg font-semibold tabular-nums ${
                up
                  ? "border border-up/40 bg-up/10 text-up-bright"
                  : "border border-down/40 bg-down/10 text-down-bright"
              }`}
            >
              {percent(example.pct)}
            </span>
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            That&apos;s the top card below. Its market price{" "}
            {up ? "went up" : "went down"} by{" "}
            {money(Math.abs(example.to - example.from))}, which is{" "}
            {percent(example.pct)} of what it used to cost.
          </p>
        </div>
      )}

      {/* Four rules, one sentence each. */}
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Rule icon="💵" title="No sale, no number">
          If nobody bought a copy, there&apos;s no market price to compare — those
          cards sit under &ldquo;Unconfirmed&rdquo; rather than in these lists.
        </Rule>
        <Rule icon="🪙" title="Cheap cards are skipped">
          A {minPrice === 5 ? "$1" : "40¢"} card going to{" "}
          {minPrice === 5 ? "$3" : "$1.20"}{" "}
          is a big jump, but it isn&apos;t news. We ignore anything under{" "}
          {money(minPrice)}.
        </Rule>
        <Rule icon="⚖️" title="Calm beats wild">
          If sellers can&apos;t agree what a card is worth, or it swings wildly every
          week anyway, we trust the move less. So a small % can sit above a big one.
        </Rule>
        {/* The rule the old note was missing entirely, and the one that actually
            decided the top of the list. Worth a tile of its own. */}
        <Rule icon="🕰️" title="Old prices catch up">
          A card that hasn&apos;t sold in months lurches the day someone finally buys
          one. That&apos;s months of drift, not a {period}-day jump — so we spread it
          over the time it really took.
        </Rule>
      </div>

      {/* The order, explained with the two cards actually on screen. Abstractly
          ("we weight by confidence") this never lands; with the reader's own #1
          sitting next to a bigger number that lost, it lands immediately. */}
      {puzzle && (
        <div className="mt-4 rounded-xl border border-edge bg-graphite p-4">
          <h4 className="text-sm font-medium text-ink">
            Why isn&apos;t the biggest jump at the top?
          </h4>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">
            <strong className="font-medium text-ink-dim">{puzzle.biggest.name}</strong>{" "}
            moved {percentPlain(puzzle.biggest.move.rawPct)} — more than{" "}
            <strong className="font-medium text-ink-dim">{puzzle.top.name}</strong>{" "}
            at {percentPlain(puzzle.top.move.rawPct)}. But {puzzle.top.name}{" "}
            is #1. Here&apos;s why:
          </p>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <Compare name={puzzle.top.name} move={puzzle.top.move} windowDays={period} winner />
            <Compare name={puzzle.biggest.name} move={puzzle.biggest.move} windowDays={period} />
          </div>

          <p className="mt-3 text-xs leading-relaxed text-ink-faint">
            {lostToPacing ? (
              <>
                {puzzle.biggest.name}&apos;s price hadn&apos;t budged in the{" "}
                {puzzle.biggest.move.effectiveDays - period} days before this period
                even started. When it finally sold, that whole stretch caught up at
                once — so its {percentPlain(puzzle.biggest.move.rawPct)} took{" "}
                {puzzle.biggest.move.effectiveDays} days to build up, not {period}.
                Spread over the time it really covers, it&apos;s{" "}
                {percentPlain(puzzle.biggest.move.pacedPct)}.
              </>
            ) : (
              <>
                {puzzle.biggest.move.weakest.detail} That makes a big % mostly noise,
                so we count {Math.round(puzzle.biggest.move.conviction)}% of it —
                against {Math.round(puzzle.top.move.conviction)}% for{" "}
                {puzzle.top.name}.
              </>
            )}{" "}
            <strong className="font-medium text-ink-dim">
              We order these lists by the score, not the raw %.
            </strong>{" "}
            A move you can trust beats a bigger one you can&apos;t.
          </p>
        </div>
      )}

      <details className="group mt-4">
        {/* Looks like a real button: the caveats in here (TCGplayer-only prices,
            "not advice") are the part people most need to find, so it shouldn't
            read as fine print. */}
        <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-lg border border-edge bg-panel-hi px-3.5 py-2 text-sm font-medium text-ink transition-colors hover:border-gold/40 hover:bg-gold/[0.06] hover:text-gold-bright">
          <span
            aria-hidden
            className="inline-block text-xs transition-transform group-open:rotate-90"
          >
            ▶
          </span>
          <span className="group-open:hidden">
            Show the exact math &amp; what it can&apos;t tell you
          </span>
          <span className="hidden group-open:inline">
            Hide the exact math
          </span>
        </summary>

        <div className="mt-3 flex flex-col gap-4 text-xs leading-relaxed text-ink-faint">
          <div>
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-graphite px-3 py-2 text-up-bright">
              change % = (market price today − market price {period} days ago) ÷
              market price {period} days ago
            </code>
            <p className="mt-2">
              That&apos;s the % on every tile — what the card actually did. We save
              every tracked card&apos;s market price once a day, and each printing
              (Normal, Foil…) is counted separately — so a Foil copy never gets
              compared against a Normal one.
            </p>
          </div>

          <div>
            <p className="mb-2">
              The <strong className="text-ink-dim">score</strong> on each tile is what
              orders the list. It&apos;s the change, spread over the days it really
              took, times how much of it we believe — squeezed onto a 0–99.9 scale so
              the numbers stay comparable:
            </p>
            <code className="block overflow-x-auto whitespace-nowrap rounded-lg bg-graphite px-3 py-2 text-up-bright">
              score ∝ paced change × conviction
            </code>
          </div>

          <div>
            <p className="mb-2">
              <strong className="text-ink-dim">Paced change.</strong> A market price
              only updates when someone buys a copy, so a card that rarely sells sits
              frozen for weeks and then lurches. That lurch isn&apos;t a{" "}
              {period}-day move — it&apos;s every day since the last sale arriving at
              once. If the last sale was 90 days ago, we count the move as spread over
              those 90 days, which is the honest rate. A card whose price is current
              gets its full change, uncorrected.
            </p>
          </div>

          <div>
            <p className="mb-2">
              <strong className="text-ink-dim">Conviction</strong> is two things
              multiplied. First, whether sellers agree — we compare the cheapest and
              priciest copy on sale:
            </p>
            <table className="w-full max-w-xs text-left">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-0.5 font-medium">Priciest ÷ cheapest</th>
                  <th className="py-0.5 font-medium">Counts for</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr><td className="py-0.5">under 2×</td><td className="text-up/80">100%</td></tr>
                <tr><td className="py-0.5">2× – 4×</td><td className="text-up/70">80%</td></tr>
                <tr><td className="py-0.5">4× – 10×</td><td className="text-gold/80">55%</td></tr>
                <tr><td className="py-0.5">over 10×</td><td className="text-down/80">30%</td></tr>
                <tr><td className="py-0.5">no copies listed</td><td className="text-gold/80">60%</td></tr>
              </tbody>
            </table>
            <p className="mb-2 mt-3">
              Second, whether a move this size is unusual <em>for this card</em>. We
              look at how much it normally swings day to day, before this move:
            </p>
            <table className="w-full max-w-xs text-left">
              <thead className="text-ink-faint">
                <tr>
                  <th className="py-0.5 font-medium">Normal daily swing</th>
                  <th className="py-0.5 font-medium">Counts for</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr><td className="py-0.5">under 2% — steady</td><td className="text-up/80">100%</td></tr>
                <tr><td className="py-0.5">2% – 8% — moves a bit</td><td className="text-up/70">85%</td></tr>
                <tr><td className="py-0.5">8% – 25% — jumpy</td><td className="text-gold/80">65%</td></tr>
                <tr><td className="py-0.5">over 25% — erratic</td><td className="text-down/80">35%</td></tr>
              </tbody>
            </table>
          </div>

          <div>
            <p className="mb-1 text-ink-dim">Worth knowing:</p>
            <ul className="flex list-disc flex-col gap-1 pl-4">
              <li>
                These are <strong>TCGplayer sales only</strong> — not eBay or
                Japanese shops, where the same card can go for a different price.
              </li>
              <li>
                Sellers agreeing isn&apos;t the same as a card <em>selling</em>. We
                can&apos;t see how many copies actually sold.
              </li>
              <li>Prices are saved once a day, so moves within a day are invisible.</li>
              <li>
                <strong>This isn&apos;t advice.</strong> A big move is a reason to
                go look closer, not a reason to buy or sell.
              </li>
            </ul>
          </div>
        </div>
      </details>
    </section>
  );
}

/**
 * One side of the "why isn't the biggest at the top" comparison.
 *
 * Walks the same path the score does, in order: what it moved, how long that really
 * took, how much of it we believe, what that scores. A reader who follows the four
 * lines has followed the formula — which is the point, since the two cards side by
 * side are the only place the ordering ever gets to prove itself.
 */
function Compare({
  name,
  move,
  windowDays,
  winner,
}: {
  name: string;
  move: MoveScore;
  windowDays: number;
  winner?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border p-3 ${
        winner ? "border-up/30 bg-up/[0.06]" : "border-edge"
      }`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="line-clamp-1 text-xs font-medium text-ink-dim">{name}</span>
        {winner && (
          <span className="shrink-0 text-[10px] font-semibold text-up-bright">
            #1
          </span>
        )}
      </div>

      <div className="mt-1.5 flex flex-col gap-1 text-[11px] text-ink-faint">
        <span>
          moved{" "}
          <strong className="font-medium tabular-nums text-ink-dim">
            {percentPlain(move.rawPct)}
          </strong>
          {move.paced && (
            <>
              {" "}
              over{" "}
              <strong className="font-medium tabular-nums text-ink-dim">
                {move.effectiveDays} days
              </strong>
              , so{" "}
              <strong className="font-medium tabular-nums text-ink-dim">
                {percentPlain(move.pacedPct)}
              </strong>{" "}
              per {windowDays} days
            </>
          )}
        </span>
        <span>
          {move.weakest.label} — we believe{" "}
          <strong className={`font-semibold tabular-nums ${CONVICTION_STYLES[convictionTier(move.conviction)]}`}>
            {Math.round(move.conviction)}%
          </strong>{" "}
          of it
        </span>
      </div>

      <div className="mt-1.5 border-t border-edge pt-1.5 text-[11px] text-ink-faint">
        score{" "}
        <strong className="font-mono font-semibold tabular-nums text-ink-dim">
          {Math.abs(move.score).toFixed(1)}
        </strong>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  up,
}: {
  label: string;
  value: string;
  /** Direction this price moved. Omitted for a price that isn't moving. */
  up?: boolean;
}) {
  return (
    <span className="flex flex-col">
      <span className="text-[11px] text-ink-faint">{label}</span>
      <span
        className={`font-mono text-lg font-semibold tabular-nums ${
          up == null ? "text-gold-bright" : up ? "text-up-bright" : "text-down-bright"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

function Rule({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-edge bg-panel p-3">
      <div className="flex items-center gap-2">
        <span aria-hidden className="text-base">
          {icon}
        </span>
        <span className="text-sm font-medium text-ink">{title}</span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-ink-faint">{children}</p>
    </div>
  );
}
