"use client";

import { useId, useMemo, useState } from "react";
import { money, formatDate } from "@/lib/format";
import { seriesStats, type SeriesStats } from "@/lib/cardStats";

/** One labelled number in the hover panel. */
function Reading({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <span className="flex flex-col gap-0.5">
      <span className="text-[11px] leading-none text-ink-faint">{label}</span>
      <span
        className={`leading-none tabular-nums ${
          strong ? "font-semibold text-ink" : "text-ink-dim"
        }`}
      >
        {value}
      </span>
    </span>
  );
}

const RANGES: { label: string; days: number | null }[] = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: null },
];

// Validated against our dark surface with the dataviz validator:
// lightness band, chroma floor, CVD separation and contrast all pass, worst
// adjacent ΔE 41.3 (protan) across the three together.
const SERIES_COLORS = ["#3987e5", "#199e70"];

// Asking is its own measure, not a shade of paid, so it gets its own hue rather
// than a tint of the line. Amber is the CVD-safe partner to blue, and it's the
// one categorical slot that can't be mistaken for a second printing's aqua.
const BAND_COLOR = "#c98500";

// Chart chrome, matched to the brand's panel/edge/ink-faint. The series colors
// above deliberately aren't brand colors: they're carrying data, they were
// picked and CVD-validated as a set, and foil gold sits close enough to the
// amber band to muddy exactly the comparison this chart exists to make.
const SURFACE = "#141419";
const GRID = "#26262e";
const AXIS_TEXT = "#8b8b96";

// How far above the typical price an ask may sit and still be believed enough to
// stretch the y-axis. Generous on purpose: a wide band is real information on a
// thin card, and clipping a legitimate ask costs more than a little headroom.
// The junk this exists to reject isn't near the line — it misses by 100x–10000x.
const BAND_CEILING = 8;

/** Middle value — a card's typical price, unmoved by a few junk asks. */
function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// right leaves room for the endpoint price label, which sits outside the plot.
const PAD = { top: 20, right: 84, bottom: 28, left: 56 };
const W = 760;
const H = 300;

/**
 * A card's price over time: market price line plus the asking range behind it.
 *
 * The band is the point of this chart, not decoration. Market price only moves
 * when a copy sells, so on a thinly-traded card the line goes flat for weeks
 * while the band quietly tracks what people are really asking. When the two
 * disagree, the band is the live number and the line is history — see the
 * comment atop lib/cardStats.ts for the Charizard case that made this obvious.
 *
 * Held over from the previous version, per the data-viz method:
 *  - one y-axis (never dual) — every series is the same measure, USD
 *  - thin marks, solid hairline grid one shade off the surface
 *  - selective direct labels: latest, high and low — not a number on every dot
 *  - crosshair + tooltip, plus a table view so values are never tooltip-gated
 *  - a legend only when there are 2+ series
 *
 * The draw-on animation is keyed to the series and runs once. It's wrapped in
 * prefers-reduced-motion: no-preference, so a reader who's asked for less motion
 * gets the finished chart immediately rather than a degraded one.
 */
export function PriceChart({ series: all }: { series: SeriesStats[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const uid = useId().replace(/:/g, "");

  // How much history this card actually has — no point offering "1Y" on a card
  // we've tracked for six weeks.
  const spanDays = useMemo(() => {
    const ds = all.flatMap((s) => s.points.map((p) => p.date)).sort();
    if (ds.length < 2) return 0;
    return Math.round(
      (new Date(ds.at(-1)!).getTime() - new Date(ds[0]).getTime()) / 86_400_000,
    );
  }, [all]);

  const choices = useMemo(
    () => RANGES.filter((r) => r.days == null || r.days < spanDays),
    [spanDays],
  );
  // Default to a year where we have one: two years of daily marks in 700px is a
  // smear, and recent history is what a trade turns on.
  const [range, setRange] = useState<number | null>(() =>
    spanDays > 365 ? 365 : null,
  );

  // Recompute stats over the visible window rather than slicing the parent's —
  // otherwise the high/low markers point at dates that aren't on screen.
  const series = useMemo(() => {
    if (range == null) return all;
    const last = all.flatMap((s) => s.points.map((p) => p.date)).sort().at(-1);
    if (!last) return all;
    const cut = new Date(last);
    cut.setUTCDate(cut.getUTCDate() - range);
    const cutoff = cut.toISOString().slice(0, 10);
    return all
      .map((s) => seriesStats(s.label, s.points.filter((p) => p.date >= cutoff)))
      .filter((s) => s.points.length > 0);
  }, [all, range]);

  const { dates, yMin, yMax, xFor, yFor } = useMemo(() => {
    const dates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date))),
    ).sort();
    const pool = (get: (p: SeriesStats["points"][number]) => number | null) =>
      series.flatMap((s) =>
        s.points.map(get).filter((v): v is number => v != null),
      );
    const paid = pool((p) => p.market);
    const lows = pool((p) => p.low);
    const highs = pool((p) => p.high);

    // An asking price is unbounded, and TCGplayer carries some absurd ones: a
    // $21 card asking $9,999.99 (which slips under the 99999 "no data" sentinel
    // tracking.ts screens for), a $30 Iron Moth asking $214,213.52. Pooling
    // those straight into the domain is what pinned yMax near $11k and squashed
    // a card that really moved $19.61–$58.57 into the bottom half-percent of the
    // plot — a flat line, on a chart whose whole job is showing the move.
    //
    // The cutoff hangs off the MEDIAN, not any field's max. Two reasons: junk can
    // land in any of the three fields (Iron Moth carries 214213.52 as both its
    // low and its high, so no single field is trustworthy enough to size by), and
    // the median is what the card typically costs — which is the scale a reader
    // is actually trying to see. Sizing off max(paid) instead was measurably
    // worse: on a card that ran 572% it let asks 6x the price back in and
    // squashed the line all over again.
    //
    // A grail may never have sold through TCGplayer and has no market price at
    // all; then the asks are all we have and the lows carry the median.
    const anchor = paid.length ? paid : lows.length ? lows : highs;

    // Market is a price someone actually PAID — ingest trusts it unconditionally
    // (sanePrice in lib/tracking.ts) and no seller's fantasy moves it — so it is
    // never clipped: the line and its ▲/▼ markers always fit, whatever the
    // median says. Asks get in only within reach of typical. Above the ceiling
    // the plot clips instead of the axis stretching to meet it. Tune
    // BAND_CEILING, not this comment.
    const ceiling = Math.max(
      paid.length ? Math.max(...paid) : 0,
      median(anchor) * BAND_CEILING,
    );
    const kept = [...paid, ...lows, ...highs].filter((v) => v <= ceiling);

    let lo = Math.min(...(kept.length ? kept : anchor));
    let hi = Math.max(...(kept.length ? kept : anchor));
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    const span = hi - lo || hi || 1;
    const yMin = Math.max(0, lo - span * 0.12);
    const yMax = hi + span * 0.12;
    const xFor = (i: number) =>
      PAD.left +
      (dates.length <= 1 ? 0 : (i / (dates.length - 1)) * (W - PAD.left - PAD.right));
    const yFor = (v: number) =>
      PAD.top + (1 - (v - yMin) / (yMax - yMin || 1)) * (H - PAD.top - PAD.bottom);
    return { dates, yMin, yMax, xFor, yFor };
  }, [series]);

  if (dates.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-edge bg-panel/50 px-4 py-10 text-center text-sm text-ink-faint">
        No price history recorded for this card yet.
      </p>
    );
  }

  const idxOf = (d: string) => dates.indexOf(d);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const hoverDate = hoverIdx != null ? dates[hoverIdx] : null;
  const primary = series[0];
  const hasBand = primary.points.some((p) => p.low != null && p.high != null);

  // The primary's area wash. Rendered before the band rather than with its line:
  // it's decoration, and a 0.30 blue laid over the band would mute the amber in
  // exactly the region the band exists to show.
  const areaPts = primary.points.filter((p) => p.market != null);
  const primaryArea =
    areaPts.length > 1
      ? areaPts
          .map(
            (p, i) =>
              `${i === 0 ? "M" : "L"}${xFor(idxOf(p.date))},${yFor(p.market!)}`,
          )
          .join(" ") +
        ` L${xFor(idxOf(areaPts.at(-1)!.date))},${yFor(yMin)}` +
        ` L${xFor(idxOf(areaPts[0].date))},${yFor(yMin)} Z`
      : "";

  // Band: out along the highs, back along the lows.
  const bandPts = primary.points.filter((p) => p.low != null && p.high != null);
  const bandPath =
    bandPts.length > 1
      ? bandPts
          .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(idxOf(p.date))},${yFor(p.high!)}`)
          .join(" ") +
        " " +
        [...bandPts]
          .reverse()
          .map((p) => `L${xFor(idxOf(p.date))},${yFor(p.low!)}`)
          .join(" ") +
        " Z"
      : "";

  return (
    <div className="flex flex-col gap-3">
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          .draw-${uid} {
            stroke-dasharray: 1;
            stroke-dashoffset: 1;
            animation: dash-${uid} 1100ms cubic-bezier(.22,.61,.36,1) forwards;
          }
          .fade-${uid} { opacity: 0; animation: fade-${uid} 700ms ease-out 400ms forwards; }
          .pop-${uid}  { opacity: 0; animation: fade-${uid} 320ms ease-out 1050ms forwards; }
          .pulse-${uid} { animation: pulse-${uid} 2.4s ease-out 1.4s infinite; transform-origin: center; }
          @keyframes dash-${uid}  { to { stroke-dashoffset: 0; } }
          @keyframes fade-${uid}  { to { opacity: 1; } }
          @keyframes pulse-${uid} {
            0%   { r: 4; opacity: .55; }
            70%  { r: 13; opacity: 0; }
            100% { r: 13; opacity: 0; }
          }
        }
      `}</style>

      {choices.length > 1 && (
        <div className="flex items-center gap-1">
          {choices.map((r) => {
            const active = range === r.days;
            return (
              <button
                key={r.label}
                onClick={() => {
                  setRange(r.days);
                  setHoverIdx(null); // indices are per-window; stale hover lies
                }}
                aria-pressed={active}
                className={`rounded-md px-2.5 py-1 text-xs font-medium tabular-nums transition-colors ${
                  active
                    ? "bg-panel-hi text-ink"
                    : "text-ink-faint hover:bg-panel hover:text-ink-dim"
                }`}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Plain-language key. The old one-line legend didn't land — the first
          person to see this chart asked "what's the blue in the background?",
          which is the whole point of it. Say what each mark MEANS, not what it
          is called. */}
      <div className="flex flex-col gap-1.5 rounded-lg border border-edge bg-panel/50 px-3 py-2.5 text-xs">
        <span className="flex items-start gap-2 text-ink-dim">
          <span
            aria-hidden
            className="mt-1.5 h-0.5 w-4 shrink-0 rounded-full"
            style={{ background: SERIES_COLORS[0] }}
          />
          <span>
            <strong className="font-semibold text-ink">The line</strong> is
            what people <em>paid</em> — it only moves when a copy actually sells.
          </span>
        </span>
        {hasBand && (
          <span className="flex items-start gap-2 text-ink-dim">
            <span
              aria-hidden
              className="mt-1 h-2.5 w-4 shrink-0 rounded-sm border"
              style={{
                background: `${BAND_COLOR}42`,
                borderColor: `${BAND_COLOR}a6`,
              }}
            />
            <span>
              <strong className="font-semibold text-ink">The shaded band</strong>{" "}
              is what sellers are <em>asking</em>
              {series.length > 1 ? ` (${primary.label})` : ""} — top edge is the
              priciest copy listed, bottom edge the cheapest. Above the line means
              sellers want more than the last sale.
            </span>
          </span>
        )}
        {series.length > 1 && (
          <span className="flex flex-wrap items-center gap-3 pt-0.5 text-ink-faint">
            {series.map((s, i) => (
              <span key={s.label} className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-0.5 w-4 rounded-full"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                {s.label}
              </span>
            ))}
          </span>
        )}
        {hasBand && (
          <span className="pt-0.5 text-[11px] leading-snug text-ink-faint">
            The cheapest copy isn&apos;t always a fair comparison — TCGplayer&apos;s
            low price counts every condition, so the band&apos;s bottom edge can be a
            damaged card.
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-edge bg-panel p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[300px] w-full min-w-[560px]"
          role="img"
          aria-label={`Market price from ${formatDate(dates[0])} to ${formatDate(
            dates[dates.length - 1],
          )}, ranging ${primary.low ? money(primary.low.price) : ""} to ${
            primary.high ? money(primary.high.price) : ""
          }`}
          onMouseLeave={() => setHoverIdx(null)}
        >
          <defs>
            {/* An ask above the ceiling is still drawn — it just gets cut off at
                the plot edge instead of dragging the axis up to meet it. Running
                off the top reads as "higher than this view", which is honest and
                is what it is. */}
            <clipPath id={`plot-${uid}`}>
              <rect
                x={PAD.left}
                y={PAD.top}
                width={W - PAD.left - PAD.right}
                height={H - PAD.top - PAD.bottom}
              />
            </clipPath>
            {series.map((s, i) => (
              <linearGradient
                key={s.label}
                id={`area-${uid}-${i}`}
                x1="0"
                y1="0"
                x2="0"
                y2="1"
              >
                <stop
                  offset="0%"
                  stopColor={SERIES_COLORS[i % SERIES_COLORS.length]}
                  stopOpacity="0.30"
                />
                <stop
                  offset="100%"
                  stopColor={SERIES_COLORS[i % SERIES_COLORS.length]}
                  stopOpacity="0"
                />
              </linearGradient>
            ))}
          </defs>

          {/* recessive hairline grid — solid, never dashed */}
          {ticks.map((t) => (
            <g key={t}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yFor(t)}
                y2={yFor(t)}
                stroke={GRID}
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yFor(t) + 3}
                textAnchor="end"
                fill={AXIS_TEXT}
                fontSize="10"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {money(t)}
              </text>
            </g>
          ))}

          <text x={PAD.left} y={H - 8} fill={AXIS_TEXT} fontSize="10">
            {formatDate(dates[0])}
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            fill={AXIS_TEXT}
            fontSize="10"
          >
            {formatDate(dates[dates.length - 1])}
          </text>

          {primaryArea && (
            <path
              className={`fade-${uid}`}
              d={primaryArea}
              fill={`url(#area-${uid}-0)`}
            />
          )}

          {/* asking range — behind the lines, above the wash */}
          {bandPath && (
            <path
              className={`fade-${uid}`}
              clipPath={`url(#plot-${uid})`}
              d={bandPath}
              fill={BAND_COLOR}
              fillOpacity="0.26"
              stroke={BAND_COLOR}
              strokeOpacity="0.65"
              strokeWidth="1"
            />
          )}

          {hoverDate && (
            <line
              x1={xFor(idxOf(hoverDate))}
              x2={xFor(idxOf(hoverDate))}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="#ffffff"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
          )}

          {series.map((s, si) => {
            const color = SERIES_COLORS[si % SERIES_COLORS.length];
            const pts = s.points.filter((p) => p.market != null);
            if (pts.length === 0) return null;
            const line = pts
              .map(
                (p, i) =>
                  `${i === 0 ? "M" : "L"}${xFor(idxOf(p.date))},${yFor(p.market!)}`,
              )
              .join(" ");
            const last = pts.at(-1)!;
            const hovered = hoverDate
              ? pts.find((p) => p.date === hoverDate)
              : undefined;
            return (
              <g key={s.label}>
                <path
                  className={`draw-${uid}`}
                  pathLength={1}
                  d={line}
                  fill="none"
                  stroke={color}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {/* selective direct labels: period high and low */}
                {si === 0 &&
                  ([s.high, s.low].filter(Boolean) as { price: number; date: string }[])
                    .filter((e) => e.price !== last.market)
                    .map((e) => (
                      <g key={`${e.date}-${e.price}`} className={`pop-${uid}`}>
                        <circle
                          cx={xFor(idxOf(e.date))}
                          cy={yFor(e.price)}
                          r="3"
                          fill={SURFACE}
                          stroke={color}
                          strokeWidth="1.5"
                        />
                        <text
                          // Nudge off the y-axis when the extreme lands on day 1,
                          // otherwise the label sits on top of the tick numbers.
                          x={Math.max(xFor(idxOf(e.date)), PAD.left + 26)}
                          y={
                            e === s.high
                              ? yFor(e.price) - 8
                              : yFor(e.price) + 14
                          }
                          textAnchor="middle"
                          fill={AXIS_TEXT}
                          fontSize="9.5"
                          style={{ fontVariantNumeric: "tabular-nums" }}
                        >
                          {e === s.high ? "▲" : "▼"} {money(e.price)}
                        </text>
                      </g>
                    ))}
                <g className={`pop-${uid}`}>
                  <circle
                    className={`pulse-${uid}`}
                    cx={xFor(idxOf(last.date))}
                    cy={yFor(last.market!)}
                    r="4"
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={xFor(idxOf(last.date))}
                    cy={yFor(last.market!)}
                    r="4"
                    fill={color}
                    stroke={SURFACE}
                    strokeWidth="2"
                  />
                  <text
                    x={xFor(idxOf(last.date)) + 9}
                    y={yFor(last.market!) + 4}
                    fill="#ffffff"
                    fontSize="11"
                    fontWeight="600"
                    style={{ fontVariantNumeric: "tabular-nums" }}
                  >
                    {money(last.market!)}
                  </text>
                </g>
                {hovered && (
                  <circle
                    cx={xFor(idxOf(hovered.date))}
                    cy={yFor(hovered.market!)}
                    r="4.5"
                    fill={color}
                    stroke={SURFACE}
                    strokeWidth="2"
                  />
                )}
              </g>
            );
          })}

          {/* Hit targets. One rect per day works at 45 points but becomes a 1px
              sliver at 730 — so past that, track the pointer across a single
              overlay and resolve to the nearest day instead. */}
          {dates.length <= 120 ? (
            dates.map((d, i) => {
              const bandW = (W - PAD.left - PAD.right) / Math.max(1, dates.length - 1);
              return (
                <rect
                  key={d}
                  x={xFor(i) - bandW / 2}
                  y={PAD.top}
                  width={Math.max(bandW, 10)}
                  height={H - PAD.top - PAD.bottom}
                  fill="transparent"
                  onMouseEnter={() => setHoverIdx(i)}
                />
              );
            })
          ) : (
            <rect
              // Overhang the plot into the padding so the first and last day are
              // reachable without pixel-perfect aim; the index is clamped anyway.
              x={PAD.left - 16}
              y={PAD.top}
              width={W - PAD.left - PAD.right + 32}
              height={H - PAD.top - PAD.bottom}
              fill="transparent"
              onMouseMove={(e) => {
                const svg = e.currentTarget.ownerSVGElement!;
                const ctm = svg.getScreenCTM();
                if (!ctm) return;
                // Screen px -> viewBox units -> nearest day index. Go through the
                // CTM rather than the bounding box: preserveAspectRatio letterboxes
                // the 760x300 viewBox inside a wider element, so box-relative math
                // reads dead space as data and pins the hover near the middle.
                const vx = new DOMPoint(e.clientX, e.clientY).matrixTransform(
                  ctm.inverse(),
                ).x;
                const frac = (vx - PAD.left) / (W - PAD.left - PAD.right);
                const i = Math.round(frac * (dates.length - 1));
                setHoverIdx(Math.min(dates.length - 1, Math.max(0, i)));
              }}
            />
          )}
        </svg>
      </div>

      {/* Every number gets named. The old tooltip read "$1,699.99 (asking
          $1,500.00–$2,000.00)" and left the reader to work out which was
          which — the same failure as the legend. */}
      {hoverDate && (
        <div className="rounded-lg border border-edge bg-panel px-3 py-2.5 text-xs">
          <div className="mb-2 font-medium text-ink-dim">
            {formatDate(hoverDate)}
          </div>
          <div className="flex flex-col gap-2.5">
            {series.map((s, i) => {
              const p = s.points.find((pt) => pt.date === hoverDate);
              if (!p) return null;
              return (
                <div key={s.label} className="flex flex-col gap-1.5">
                  {series.length > 1 && (
                    <span className="flex items-center gap-1.5 text-ink-dim">
                      <span
                        aria-hidden
                        className="h-2 w-2 rounded-full"
                        style={{
                          background: SERIES_COLORS[i % SERIES_COLORS.length],
                        }}
                      />
                      {s.label}
                    </span>
                  )}
                  <div className="flex flex-wrap gap-x-6 gap-y-1.5">
                    <Reading
                      label={p.market != null ? "Someone paid" : "Nobody bought one"}
                      value={p.market != null ? money(p.market) : "—"}
                      strong
                    />
                    <Reading label="Cheapest on sale" value={money(p.low)} />
                    <Reading label="Typical asking price" value={money(p.mid)} />
                    <Reading label="Priciest on sale" value={money(p.high)} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-ink-faint hover:text-ink-dim"
        >
          {showTable ? "▾ Hide table" : "▸ View as table"}
        </button>
        {showTable && (
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-edge">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-panel text-ink-faint">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Printing</th>
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Asking low–high</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-ink-dim">
                {[...dates].reverse().map((d) =>
                  series.map((s) => {
                    const p = s.points.find((pt) => pt.date === d);
                    if (!p) return null;
                    return (
                      <tr key={`${d}-${s.label}`} className="border-t border-edge">
                        <td className="px-3 py-1.5">{formatDate(d)}</td>
                        <td className="px-3 py-1.5 text-ink-dim">{s.label}</td>
                        <td className="px-3 py-1.5">
                          {p.market != null ? money(p.market) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-ink-faint">
                          {p.low != null && p.high != null
                            ? `${money(p.low)} – ${money(p.high)}`
                            : "—"}
                        </td>
                      </tr>
                    );
                  }),
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
