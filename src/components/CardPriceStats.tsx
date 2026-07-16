import { money, percent, formatDate } from "@/lib/format";
import { confidenceTier, spreadRatio, ConfidenceTier } from "@/lib/confidence";
import type { SeriesStats } from "@/lib/cardStats";

// Short forms of CONFIDENCE_LABEL — the long sentences don't fit a stat cell,
// and the hint underneath already gives the actual ratio.
const TIER_WORD: Record<ConfidenceTier, string> = {
  high: "Tight",
  medium: "Moderate",
  low: "Wide",
};
const TIER_TONE: Record<ConfidenceTier, "good" | "warn" | "bad"> = {
  high: "good",
  medium: "warn",
  low: "bad",
};

/**
 * The decision panel: everything someone haggling over this card needs, and the
 * caveats that stop them reading it wrong.
 *
 * Two honesty rules drive the layout:
 *  - When the market price is stale, say so ABOVE the change figures rather than
 *    in a footnote, because a stale base makes every one of those figures wrong.
 *    "+240% in a day" is really "this number was 44 days out of date".
 *  - Asking range sits level with market price, not below it. On thin cards it's
 *    the only live signal there is.
 */

/** How much history is behind these numbers, in words a reader can use. */
function spanLabel(s: SeriesStats): string {
  const ds = s.points.map((p) => p.date);
  if (ds.length < 2) return "Range so far";
  const days = Math.round(
    (new Date(ds.at(-1)!).getTime() - new Date(ds[0]).getTime()) / 86_400_000,
  );
  if (days >= 700) return "2-year range";
  if (days >= 350) return "52-week range";
  if (days >= 150) return `${Math.round(days / 30)}-month range`;
  return `Range over ${days} days`;
}

/** Where today's price sits between the period low and high. */
function RangeBar({ s }: { s: SeriesStats }) {
  if (!s.high || !s.low || s.rangePos == null) return null;
  const pos = Math.min(1, Math.max(0, s.rangePos));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-white/40">
        <span>Low · {formatDate(s.low.date)}</span>
        <span className="text-white/50">{spanLabel(s)}</span>
        <span>High · {formatDate(s.high.date)}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-gradient-to-r from-sky-500/25 via-white/15 to-emerald-500/30">
        <div
          className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]"
          style={{ left: `${pos * 100}%` }}
        />
      </div>
      <div className="mt-1.5 flex items-baseline justify-between text-xs tabular-nums">
        <span className="text-white/70">{money(s.low.price)}</span>
        <span className="text-white/70">{money(s.high.price)}</span>
      </div>
    </div>
  );
}

function Fact({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "warn" | "bad";
}) {
  const color =
    tone === "good"
      ? "text-emerald-400"
      : tone === "warn"
        ? "text-amber-400"
        : tone === "bad"
          ? "text-rose-400"
          : "text-white/85";
  return (
    <div className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-white/35">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-white/35">{hint}</div>}
    </div>
  );
}

/**
 * Split in two so the page can lay them out sensibly: the headline sits beside
 * the card image (roughly filling its height), while the stat grids run the full
 * width below, where 4 columns actually fit.
 */
export function CardPriceHeadline({ s }: { s: SeriesStats }) {
  const cur = s.points.filter((p) => p.market != null).at(-1)?.market ?? null;
  const latest = s.latest;
  const stale = s.staleDays != null && s.staleDays >= 7;

  // Asking range vs market price: on a stale card these disagree, and the gap is
  // the actual story. Worth naming rather than leaving two numbers side by side.
  const askGap =
    cur != null && latest?.low != null && latest.low > cur * 1.25
      ? (latest.low - cur) / cur
      : null;

  // confidenceTier() falls back to "low" when the spread is unknown, which would
  // libel a card that simply has no listings. Only show a tier when there's a
  // real ratio behind it.
  const ratio = spreadRatio(latest?.low, latest?.high);
  const tier = ratio != null ? confidenceTier(latest?.low, latest?.high) : null;

  // A big move that ended a long freeze is a catch-up. Only worth calling out
  // while it's still the headline number people are reading (~a week).
  const m = s.lastMove;
  const catchUp =
    m &&
    m.flatDaysBefore >= 14 &&
    m.pct != null &&
    Math.abs(m.pct) >= 0.25 &&
    s.staleDays != null &&
    s.staleDays <= 7
      ? m
      : null;

  return (
    <div className="flex flex-col gap-4">
      {stale && (
        <div className="flex gap-2.5 rounded-xl border border-amber-500/25 bg-amber-500/[0.07] px-3.5 py-3">
          <span aria-hidden className="text-base leading-none">
            ⏳
          </span>
          <div className="text-xs leading-relaxed text-amber-200/85">
            <strong className="font-semibold text-amber-200">
              This price is {s.staleDays} days old.
            </strong>{" "}
            Market price only updates when someone actually buys a copy, and
            nobody has bought this one in {s.staleDays} days — so the change
            figures below are measured from a stale number, and a jump would mean
            the price caught up, not that it moved.
            {askGap != null && (
              <>
                {" "}
                Sellers are currently asking{" "}
                <strong className="font-semibold text-amber-200">
                  {percent(askGap)} more
                </strong>{" "}
                than that last sale — treat the asking range as the live price
                here.
              </>
            )}
          </div>
        </div>
      )}

      {catchUp && (
        <div className="flex gap-2.5 rounded-xl border border-sky-500/25 bg-sky-500/[0.07] px-3.5 py-3">
          <span aria-hidden className="text-base leading-none">
            ⏱
          </span>
          <div className="text-xs leading-relaxed text-sky-100/85">
            <strong className="font-semibold text-sky-100">
              That {percent(catchUp.pct!)} is a catch-up, not a spike.
            </strong>{" "}
            The price sat at {money(catchUp.from)} for {catchUp.flatDaysBefore}{" "}
            days — market price only moves when a copy sells — then a sale landed
            on {formatDate(catchUp.date)} at {money(catchUp.to)}. The card
            didn&apos;t gain {percent(catchUp.pct!)} in a day; the number was out
            of date and caught up all at once.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-white/40">
            Market price{s.label !== "Normal" ? ` · ${s.label}` : ""}
          </div>
          <div className="mt-0.5 text-3xl font-semibold tabular-nums text-white">
            {cur != null ? money(cur) : "N/A"}
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            {cur != null
              ? s.staleDays === 0
                ? "updated today from a real sale"
                : `last changed ${s.staleDays} day${s.staleDays === 1 ? "" : "s"} ago`
              : "nobody has bought one — asking price only"}
          </div>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs text-white/40">Asking now — cheapest to priciest</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-white">
            {latest?.low != null && latest?.high != null
              ? `${money(latest.low)} – ${money(latest.high)}`
              : "—"}
          </div>
          <div className="mt-1 text-[11px] text-white/35">
            {latest?.low != null
              ? `cheapest copy you can buy right now: ${money(latest.low)}`
              : "no live listings"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <RangeBar s={s} />
      </div>
    </div>
  );
}

export function CardPriceFacts({ s }: { s: SeriesStats }) {
  const latest = s.latest;
  const ratio = spreadRatio(latest?.low, latest?.high);
  const tier = ratio != null ? confidenceTier(latest?.low, latest?.high) : null;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-2 text-[11px] uppercase tracking-wide text-white/35">
          Change in market price
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {s.changes.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-white/[0.07] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="text-[11px] uppercase tracking-wide text-white/35">
                {c.label}
              </div>
              <div
                className={`mt-0.5 text-sm font-semibold tabular-nums ${
                  c.pct == null
                    ? "text-white/30"
                    : c.pct > 0
                      ? "text-emerald-400"
                      : c.pct < 0
                        ? "text-rose-400"
                        : "text-white/60"
                }`}
              >
                {c.pct == null ? "—" : c.pct === 0 ? "no change" : percent(c.pct)}
              </div>
              {c.from != null && (
                <div className="mt-0.5 text-[11px] text-white/35">
                  from {money(c.from)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact
          label="Seller agreement"
          value={tier ? TIER_WORD[tier] : "—"}
          hint={
            s.spread != null
              ? `priciest copy is ${s.spread.toFixed(1)}× the cheapest`
              : "no live listings"
          }
          tone={tier ? TIER_TONE[tier] : undefined}
        />
        <Fact
          label="Day-to-day swing"
          value={s.volatility != null ? `± ${(s.volatility * 100).toFixed(1)}%` : "—"}
          hint={
            s.volatility == null
              ? "not enough history"
              : s.volatility < 0.02
                ? "steady — quotes hold up"
                : s.volatility < 0.08
                  ? "moves a bit day to day"
                  : "jumpy — quote it fresh"
          }
          tone={
            s.volatility == null
              ? undefined
              : s.volatility < 0.02
                ? "good"
                : s.volatility < 0.08
                  ? "warn"
                  : "bad"
          }
        />
        <Fact
          label="Cheapest ever seen"
          value={s.low ? money(s.low.price) : "—"}
          hint={s.low ? formatDate(s.low.date) : undefined}
        />
        <Fact
          label="Priciest ever seen"
          value={s.high ? money(s.high.price) : "—"}
          hint={s.high ? formatDate(s.high.date) : undefined}
        />
      </div>
    </div>
  );
}
