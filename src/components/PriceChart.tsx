"use client";

import { useMemo, useState } from "react";
import { money, formatDate } from "@/lib/format";

export interface Series {
  label: string; // subtype, e.g. "Normal" / "Foil"
  points: { date: string; price: number; low: number | null; high: number | null }[];
}

// Validated against our dark surface (#12121a) with the dataviz validator:
// lightness band, chroma floor, CVD separation (ΔE 15.7 worst) and contrast all pass.
const SERIES_COLORS = ["#3987e5", "#199e70"];

const PAD = { top: 14, right: 14, bottom: 26, left: 52 };
const W = 760;
const H = 260;

/**
 * Daily market price over time. One line per printing (Normal/Foil).
 *
 * Deliberate choices, per the data-viz method:
 *  - one y-axis (never dual) — every series is the same measure, USD
 *  - thin 2px marks, solid hairline grid one shade off the surface
 *  - selective direct labels: the latest point only, not a number on every dot
 *  - a crosshair + tooltip, plus a table view so values are never tooltip-gated
 *  - a legend only when there are 2+ series; with one, the heading names it
 */
export function PriceChart({ series }: { series: Series[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [showTable, setShowTable] = useState(false);

  const { dates, yMin, yMax, xFor, yFor } = useMemo(() => {
    const dates = Array.from(
      new Set(series.flatMap((s) => s.points.map((p) => p.date))),
    ).sort();
    const values = series.flatMap((s) => s.points.map((p) => p.price));
    let lo = Math.min(...values);
    let hi = Math.max(...values);
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
      lo = 0;
      hi = 1;
    }
    // Pad the band so the line never rides the frame; keep a floor at 0.
    const span = hi - lo || hi || 1;
    const yMin = Math.max(0, lo - span * 0.15);
    const yMax = hi + span * 0.15;
    const xFor = (i: number) =>
      PAD.left +
      (dates.length <= 1
        ? 0
        : (i / (dates.length - 1)) * (W - PAD.left - PAD.right));
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

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 && (
        <div className="flex flex-wrap gap-3">
          {series.map((s, i) => (
            <span key={s.label} className="flex items-center gap-1.5 text-xs text-white/60">
              <span
                className="h-2 w-2 rounded-full"
                style={{ background: SERIES_COLORS[i % SERIES_COLORS.length] }}
              />
              {s.label}
            </span>
          ))}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-[#12121a] p-2">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="h-[260px] w-full min-w-[560px]"
          role="img"
          aria-label={`Daily market price from ${formatDate(dates[0])} to ${formatDate(dates[dates.length - 1])}`}
          onMouseLeave={() => setHoverIdx(null)}
        >
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

          {/* x labels: first and last only — the tooltip carries the rest */}
          <text x={PAD.left} y={H - 8} fill="#898781" fontSize="10">
            {formatDate(dates[0])}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fill="#898781" fontSize="10">
            {formatDate(dates[dates.length - 1])}
          </text>

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
            const d = s.points
              .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(idxOf(p.date))},${yFor(p.price)}`)
              .join(" ");
            const last = s.points[s.points.length - 1];
            const hovered = hoverDate
              ? s.points.find((p) => p.date === hoverDate)
              : undefined;
            return (
              <g key={s.label}>
                <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
                {/* selective direct label: the endpoint only */}
                {last && (
                  <>
                    <circle
                      cx={xFor(idxOf(last.date))}
                      cy={yFor(last.price)}
                      r="4"
                      fill={color}
                      stroke="#12121a"
                      strokeWidth="2"
                    />
                    <text
                      x={xFor(idxOf(last.date)) - 8}
                      y={yFor(last.price) - 8}
                      textAnchor="end"
                      fill="#ffffff"
                      fontSize="11"
                      fontWeight="600"
                    >
                      {money(last.price)}
                    </text>
                  </>
                )}
                {hovered && (
                  <circle
                    cx={xFor(idxOf(hovered.date))}
                    cy={yFor(hovered.price)}
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
                  {money(p.price)}
                </span>
                {p.low != null && p.high != null && (
                  <span className="text-white/35">
                    (listings {money(p.low)}–{money(p.high)})
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
                  <th className="px-3 py-2 font-medium">Listings low–high</th>
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
                        <td className="px-3 py-1.5">{money(p.price)}</td>
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
