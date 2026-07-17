import { money, percent, percentPlain, formatDate } from "@/lib/format";
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
function spanWords(s: SeriesStats): string {
  const ds = s.points.map((p) => p.date);
  if (ds.length < 2) return "so far";
  const days = Math.round(
    (new Date(ds.at(-1)!).getTime() - new Date(ds[0]).getTime()) / 86_400_000,
  );
  if (days >= 700) return "over the past 2 years";
  if (days >= 350) return "over the past year";
  if (days >= 60) return `over the past ${Math.round(days / 30)} months`;
  return `over the past ${days} days`;
}

/** Where today's price sits between the period low and high. */
function RangeBar({ s }: { s: SeriesStats }) {
  if (!s.high || !s.low || s.rangePos == null) return null;
  const pos = Math.min(1, Math.max(0, s.rangePos));
  const cur = s.points.filter((p) => p.market != null).at(-1)?.market ?? null;
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-ink-dim">
        Where today&apos;s price sits {spanWords(s)}
      </div>
      {/* mt-7 reserves a row for the "today" label, which is lifted -top-6 above
          the bar — too little clearance here and it rides up into the heading. */}
      <div className="relative mt-7 h-1.5 rounded-full bg-gradient-to-r from-down/30 via-ink-faint/20 to-up/35">
        {/* The tick is the whole point of the bar, so it says what it is. */}
        <div
          className="absolute -top-1 h-3.5 w-1 -translate-x-1/2 rounded-full bg-gold shadow-[0_0_8px_rgba(228,183,80,0.7)]"
          style={{ left: `${pos * 100}%` }}
        />
        <span
          className="absolute -top-6 -translate-x-1/2 whitespace-nowrap text-[11px] font-medium text-ink"
          style={{ left: `${Math.min(92, Math.max(8, pos * 100))}%` }}
        >
          today {money(cur ?? 0)}
        </span>
      </div>
      <div className="mt-2 flex items-baseline justify-between text-[11px]">
        <span className="text-ink-faint">
          cheapest it&apos;s been{" "}
          <span className="tabular-nums text-ink-dim">{money(s.low.price)}</span>{" "}
          <span className="text-ink-faint/70">· {formatDate(s.low.date)}</span>
        </span>
        <span className="text-right text-ink-faint">
          priciest it&apos;s been{" "}
          <span className="tabular-nums text-ink-dim">{money(s.high.price)}</span>{" "}
          <span className="text-ink-faint/70">· {formatDate(s.high.date)}</span>
        </span>
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
      ? "text-up-bright"
      : tone === "warn"
        ? "text-ink-dim"
        : tone === "bad"
          ? "text-down-bright"
          : "text-ink";
  return (
    <div className="rounded-lg border border-edge bg-panel/50 px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-ink-faint">{label}</div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{value}</div>
      {hint && <div className="mt-0.5 text-[11px] leading-snug text-ink-faint">{hint}</div>}
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
        <div className="flex gap-2.5 rounded-xl border border-edge bg-panel-hi px-3.5 py-3">
          <span aria-hidden className="text-base leading-none">
            ⏳
          </span>
          <div className="text-xs leading-relaxed text-ink-dim">
            <strong className="font-semibold text-ink">
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
                <strong className="font-semibold text-ink">
                  {percentPlain(askGap)} more
                </strong>{" "}
                than that last sale — treat the asking range as the live price
                here.
              </>
            )}
          </div>
        </div>
      )}

      {catchUp && (
        <div className="flex gap-2.5 rounded-xl border border-edge bg-panel-hi px-3.5 py-3">
          <span aria-hidden className="text-base leading-none">
            ⏱
          </span>
          <div className="text-xs leading-relaxed text-ink-dim">
            <strong className="font-semibold text-ink">
              That {percent(catchUp.pct!)} is a catch-up, not a spike.
            </strong>{" "}
            The price sat at {money(catchUp.from)} for {catchUp.flatDaysBefore}{" "}
            days — market price only moves when a copy sells — then a sale landed
            on {formatDate(catchUp.date)} at {money(catchUp.to)}. It didn&apos;t
            gain {percent(catchUp.pct!)} in a day; the number was out of date and
            caught up all at once.
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-xs text-ink-faint">
            What people paid{s.label !== "Normal" ? ` · ${s.label}` : ""}
          </div>
          <div className="mt-0.5 text-3xl font-semibold tabular-nums text-ink">
            {cur != null ? money(cur) : "N/A"}
          </div>
          <div className="mt-1 text-[11px] leading-snug text-ink-faint">
            {cur != null
              ? s.staleDays === 0
                ? "someone bought one today at this price"
                : `the last time anyone bought one was ${s.staleDays} day${
                    s.staleDays === 1 ? "" : "s"
                  } ago`
              : "nobody has ever bought one — sellers are guessing"}
          </div>
        </div>

        <div className="rounded-xl border border-edge bg-panel p-4">
          <div className="text-xs text-ink-faint">What sellers want today</div>
          <div className="mt-0.5 text-2xl font-semibold tabular-nums text-ink">
            {latest?.low != null && latest?.high != null
              ? `${money(latest.low)} – ${money(latest.high)}`
              : "—"}
          </div>
          <div className="mt-1 text-[11px] leading-snug text-ink-faint">
            {latest?.low != null
              ? `you could buy one right now for ${money(latest.low)}`
              : "nothing listed for sale right now"}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-edge bg-panel p-4">
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
        <div className="mb-1 text-sm font-medium text-ink-dim">
          How the price has moved
        </div>
        <p className="mb-2.5 text-[11px] text-ink-faint">
          Comparing what people paid today against what they paid back then.
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {s.changes.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-edge bg-panel/50 px-3 py-2.5"
            >
              <div className="text-[11px] leading-snug text-ink-faint">{c.label}</div>
              <div
                className={`mt-1 text-sm font-semibold tabular-nums ${
                  c.pct == null
                    ? "text-ink-faint/70"
                    : c.pct > 0
                      ? "text-up-bright"
                      : c.pct < 0
                        ? "text-down-bright"
                        : "text-ink-dim"
                }`}
              >
                {c.pct == null
                  ? "—"
                  : c.pct === 0
                    ? "same price"
                    : `${c.pct > 0 ? "up" : "down"} ${percentPlain(c.pct)}`}
              </div>
              {c.from != null && (
                <div className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                  was {money(c.from)}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact
          label="Do sellers agree?"
          value={tier ? TIER_WORD[tier] : "—"}
          hint={
            s.spread != null
              ? `the priciest copy costs ${s.spread.toFixed(1)}× the cheapest`
              : "nothing listed right now"
          }
          tone={tier ? TIER_TONE[tier] : undefined}
        />
        <Fact
          label="Is the price steady?"
          value={
            s.volatility == null
              ? "—"
              : s.volatility < 0.02
                ? "Steady"
                : s.volatility < 0.08
                  ? "Moves a bit"
                  : "Jumpy"
          }
          hint={
            s.volatility == null
              ? "not enough history yet"
              : s.volatility < 0.02
                ? `moves about ${(s.volatility * 100).toFixed(1)}% a day — a quote holds up`
                : s.volatility < 0.08
                  ? `moves about ${(s.volatility * 100).toFixed(1)}% a day`
                  : `moves about ${(s.volatility * 100).toFixed(1)}% a day — check before quoting`
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
          label="Lowest it's ever been"
          value={s.low ? money(s.low.price) : "—"}
          hint={s.low ? `on ${formatDate(s.low.date)}` : undefined}
        />
        <Fact
          label="Highest it's ever been"
          value={s.high ? money(s.high.price) : "—"}
          hint={s.high ? `on ${formatDate(s.high.date)}` : undefined}
        />
      </div>
    </div>
  );
}
