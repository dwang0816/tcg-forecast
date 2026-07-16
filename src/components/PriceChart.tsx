"use client";

import { useId, useMemo, useState } from "react";
import { money, formatDate } from "@/lib/format";
import type { SeriesStats } from "@/lib/cardStats";

// Validated against our dark surface (#12121a) with the dataviz validator:
// lightness band, chroma floor, CVD separation (ΔE 15.7 worst) and contrast all pass.
const SERIES_COLORS = ["#3987e5", "#199e70"];

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
export function PriceChart({ series }: { series: SeriesStats[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);
  const uid = useId().replace(/:/g, "");

  const { dates, yMin, yMax, xFor, yFor } = useMemo(() => {
    const dates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date))),
    ).sort();
    // Scale to the band as well as the line — otherwise the band clips.
    const values = series.flatMap((s) =>
      s.points.flatMap((p) =>
        [p.market, p.low, p.high].filter((v): v is number => v != null),
      ),
    );
    let lo = Math.min(...values);
    let hi = Math.max(...values);
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
      <p className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-10 text-center text-sm text-white/40">
        No price history recorded for this card yet.
      </p>
    );
  }

  const idxOf = (d: string) => dates.indexOf(d);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const hoverDate = hoverIdx != null ? dates[hoverIdx] : null;
  const primary = series[0];
  const hasBand = primary.points.some((p) => p.low != null && p.high != null);

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

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
        {series.length > 1 &&
          series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 text-white/60">
              <span
                className="h-0.5 w-4 rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.label}
            </span>
          ))}
        {hasBand && (
          <span className="flex items-center gap-1.5 text-white/45">
            <span
              className="h-2.5 w-4 rounded-sm"
              style={{ background: SERIES_COLORS[0], opacity: 0.18 }}
            />
            asking range{series.length > 1 ? ` (${primary.label})` : ""} — cheapest to
            priciest copy listed
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#12121a] p-2">
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
                stroke="#2c2c2a"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={yFor(t) + 3}
                textAnchor="end"
                fill="#898781"
                fontSize="10"
                style={{ fontVariantNumeric: "tabular-nums" }}
              >
                {money(t)}
              </text>
            </g>
          ))}

          <text x={PAD.left} y={H - 8} fill="#898781" fontSize="10">
            {formatDate(dates[0])}
          </text>
          <text
            x={W - PAD.right}
            y={H - 8}
            textAnchor="end"
            fill="#898781"
            fontSize="10"
          >
            {formatDate(dates[dates.length - 1])}
          </text>

          {/* asking range, behind everything */}
          {bandPath && (
            <path
              className={`fade-${uid}`}
              d={bandPath}
              fill={SERIES_COLORS[0]}
              fillOpacity="0.14"
              stroke={SERIES_COLORS[0]}
              strokeOpacity="0.22"
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
            const area =
              `${line} L${xFor(idxOf(pts.at(-1)!.date))},${yFor(yMin)}` +
              ` L${xFor(idxOf(pts[0].date))},${yFor(yMin)} Z`;
            const last = pts.at(-1)!;
            const hovered = hoverDate
              ? pts.find((p) => p.date === hoverDate)
              : undefined;
            return (
              <g key={s.label}>
                {si === 0 && (
                  <path className={`fade-${uid}`} d={area} fill={`url(#area-${uid}-${si})`} />
                )}
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
                          fill="#12121a"
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
                          fill="#898781"
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
                    stroke="#12121a"
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
                    stroke="#12121a"
                    strokeWidth="2"
                  />
                )}
              </g>
            );
          })}

          {/* generous hit targets — one band per day, far bigger than the mark */}
          {dates.map((d, i) => {
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
          })}
        </svg>
      </div>

      {hoverDate && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg bg-white/5 px-3 py-2 text-xs">
          <span className="text-white/50">{formatDate(hoverDate)}</span>
          {series.map((s, i) => {
            const p = s.points.find((pt) => pt.date === hoverDate);
            if (!p) return null;
            return (
              <span key={s.label} className="flex items-center gap-1.5">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
                />
                <span className="text-white/50">{s.label}</span>
                <span className="font-semibold tabular-nums text-white">
                  {p.market != null ? money(p.market) : "no sale"}
                </span>
                {p.low != null && p.high != null && (
                  <span className="text-white/35">
                    (asking {money(p.low)}–{money(p.high)})
                  </span>
                )}
              </span>
            );
          })}
        </div>
      )}

      <div>
        <button
          onClick={() => setShowTable((v) => !v)}
          className="text-xs font-medium text-white/45 hover:text-white/75"
        >
          {showTable ? "▾ Hide table" : "▸ View as table"}
        </button>
        {showTable && (
          <div className="mt-2 max-h-64 overflow-auto rounded-lg border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-[#12121a] text-white/40">
                <tr>
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Printing</th>
                  <th className="px-3 py-2 font-medium">Market</th>
                  <th className="px-3 py-2 font-medium">Asking low–high</th>
                </tr>
              </thead>
              <tbody className="tabular-nums text-white/70">
                {[...dates].reverse().map((d) =>
                  series.map((s) => {
                    const p = s.points.find((pt) => pt.date === d);
                    if (!p) return null;
                    return (
                      <tr key={`${d}-${s.label}`} className="border-t border-white/5">
                        <td className="px-3 py-1.5">{formatDate(d)}</td>
                        <td className="px-3 py-1.5 text-white/50">{s.label}</td>
                        <td className="px-3 py-1.5">
                          {p.market != null ? money(p.market) : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-white/40">
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
