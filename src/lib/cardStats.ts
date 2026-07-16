/**
 * Turn a card's raw daily snapshots into the numbers a buyer or seller actually
 * needs to make a call on a price.
 *
 * The one non-obvious thing in here is `staleDays`, and it's the most important
 * number on the page. TCGplayer's "market price" only recomputes when somebody
 * buys a copy, so for a card that rarely trades it is a step function: it sits
 * frozen at an old sale for weeks, then lurches. Charizard ex (FireRed &
 * LeafGreen) held $500 for 44 straight days while every listing on the site
 * asked $1,700+, then "gained 240% in a day" when one finally sold. Nothing
 * gained 240% — the number was just months out of date and caught up at once.
 *
 * A change % computed off a stale base is fiction, so we measure the staleness
 * and let the page say so. The listing band (low–high) is the honest live
 * signal for these cards: it knew $1,700 the whole time.
 */

export interface PricePoint {
  date: string;
  market: number | null;
  low: number | null;
  mid: number | null;
  high: number | null;
  directLow: number | null;
}

export interface Extreme {
  price: number;
  date: string;
}

export interface Change {
  /** Days back this compares against; null means "the whole window we hold". */
  days: number | null;
  /** Plain English, because "24H" and "30D" are jargon to half the readers. */
  label: string;
  pct: number | null;
  from: number | null;
  fromDate: string | null;
}

export interface SeriesStats {
  label: string;
  points: PricePoint[];
  latest: PricePoint | null;
  /** Highest/lowest market price in the window, and when. */
  high: Extreme | null;
  low: Extreme | null;
  /** Where today's price sits between low (0) and high (1). */
  rangePos: number | null;
  changes: Change[];
  /** Standard deviation of day-over-day % moves. Null if too few moves. */
  volatility: number | null;
  /** Days since the market price last actually changed. */
  staleDays: number | null;
  /**
   * The most recent actual move, and how long the price had been frozen right
   * before it. A big pct off a long flatDaysBefore is a catch-up, not a rally:
   * Charizard's "+240% in 24h" was a $500 price that hadn't budged in 44 days
   * finally recording a sale at $1,699.99. Same arithmetic, opposite meaning.
   */
  lastMove: {
    date: string;
    from: number;
    to: number;
    pct: number | null;
    flatDaysBefore: number;
  } | null;
  /** Priciest listing ÷ cheapest listing, today. */
  spread: number | null;
}

const pctChange = (from: number, to: number): number | null =>
  from > 0 ? (to - from) / from : null;

/** Name the whole-history window by what it actually spans, not "All". */
export function spanLabel(days: number): string {
  if (days >= 700) return "Whole 2 years";
  if (days >= 350) return "Whole year";
  if (days >= 60) return `All ${Math.round(days / 30)} months`;
  return `All ${days} days`;
}

/** Last point at or before `daysBack` days before the newest point. */
function pointDaysBack(points: PricePoint[], daysBack: number): PricePoint | null {
  const last = points.at(-1);
  if (!last) return null;
  const target = new Date(last.date);
  target.setUTCDate(target.getUTCDate() - daysBack);
  const cutoff = target.toISOString().slice(0, 10);
  // Walk back to the newest point that isn't after the cutoff.
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].date <= cutoff) return points[i];
  }
  return null;
}

/**
 * How many days the market price has been unchanged.
 *
 * Counts back from the newest point while the price equals the newest price.
 * A card that just moved reads 0; Charizard on Jul 14 read 44.
 */
function staleness(points: PricePoint[]): number | null {
  const priced = points.filter((p) => p.market != null);
  const last = priced.at(-1);
  if (!last || last.market == null) return null;
  let since = last.date;
  for (let i = priced.length - 2; i >= 0; i--) {
    if (priced[i].market !== last.market) break;
    since = priced[i].date;
  }
  const ms = new Date(last.date).getTime() - new Date(since).getTime();
  return Math.round(ms / 86_400_000);
}

/** The newest real change in market price, plus the flat run that preceded it. */
function lastMove(points: PricePoint[]): SeriesStats["lastMove"] {
  const priced = points.filter((p) => p.market != null);
  // Newest index where the price differs from the day before it.
  let i = -1;
  for (let k = priced.length - 1; k >= 1; k--) {
    if (priced[k].market !== priced[k - 1].market) {
      i = k;
      break;
    }
  }
  if (i < 1) return null;

  const from = priced[i - 1].market!;
  const to = priced[i].market!;
  // How long `from` had already been sitting there before the move.
  let runStart = i - 1;
  while (runStart > 0 && priced[runStart - 1].market === from) runStart--;
  const flatMs =
    new Date(priced[i - 1].date).getTime() - new Date(priced[runStart].date).getTime();

  return {
    date: priced[i].date,
    from,
    to,
    pct: pctChange(from, to),
    flatDaysBefore: Math.round(flatMs / 86_400_000),
  };
}

/** Spread of day-over-day % moves — how jumpy this card is. */
function volatility(points: PricePoint[]): number | null {
  const priced = points.filter((p) => p.market != null);
  const rets: number[] = [];
  for (let i = 1; i < priced.length; i++) {
    const a = priced[i - 1].market!;
    const b = priced[i].market!;
    if (a > 0) rets.push((b - a) / a);
  }
  if (rets.length < 3) return null;
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const varc = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / rets.length;
  return Math.sqrt(varc);
}

export function seriesStats(label: string, points: PricePoint[]): SeriesStats {
  const priced = points.filter((p) => p.market != null);
  const latest = points.at(-1) ?? null;
  const cur = priced.at(-1)?.market ?? null;

  let high: Extreme | null = null;
  let low: Extreme | null = null;
  for (const p of priced) {
    const v = p.market!;
    if (!high || v > high.price) high = { price: v, date: p.date };
    if (!low || v < low.price) low = { price: v, date: p.date };
  }

  const rangePos =
    cur != null && high && low && high.price > low.price
      ? (cur - low.price) / (high.price - low.price)
      : null;

  // How far back this card's history actually goes. Offering "Last year" on a
  // card we've held for six weeks just prints a dash in a box.
  const span =
    priced.length > 1
      ? Math.round(
          (new Date(priced.at(-1)!.date).getTime() -
            new Date(priced[0].date).getTime()) /
            86_400_000,
        )
      : 0;

  const windows: { days: number | null; label: string }[] = [
    { days: 1, label: "Since yesterday" },
    { days: 7, label: "Last week" },
    { days: 30, label: "Last month" },
    { days: 90, label: "Last 3 months" },
    { days: 365, label: "Last year" },
    { days: null, label: spanLabel(span) },
  ];
  const changes: Change[] = windows
    // Keep a window only if we hold enough history to answer it honestly.
    .filter((w) => w.days == null || w.days <= span)
    .map((w) => {
      const base =
        w.days == null ? (priced[0] ?? null) : pointDaysBack(priced, w.days);
      const from = base?.market ?? null;
      return {
        days: w.days,
        label: w.label,
        from,
        fromDate: base?.date ?? null,
        pct: from != null && cur != null ? pctChange(from, cur) : null,
      };
    });

  const spread =
    latest?.low != null && latest?.high != null && latest.low > 0
      ? latest.high / latest.low
      : null;

  return {
    label,
    points,
    latest,
    high,
    low,
    rangePos,
    changes,
    volatility: volatility(points),
    staleDays: staleness(points),
    lastMove: lastMove(points),
    spread,
  };
}

/** Group raw rows into one stats bundle per printing, busiest series first. */
export function statsByPrinting(
  rows: {
    date: string;
    subTypeName: string;
    marketPrice: number | null;
    lowPrice: number | null;
    midPrice: number | null;
    highPrice: number | null;
    directLowPrice: number | null;
  }[],
): SeriesStats[] {
  const bySub = new Map<string, PricePoint[]>();
  for (const r of rows) {
    const pts = bySub.get(r.subTypeName) ?? [];
    pts.push({
      date: r.date,
      market: r.marketPrice,
      low: r.lowPrice,
      mid: r.midPrice,
      high: r.highPrice,
      directLow: r.directLowPrice,
    });
    bySub.set(r.subTypeName, pts);
  }
  return [...bySub.entries()]
    .map(([label, pts]) => seriesStats(label, pts))
    .filter((s) => s.points.length > 0)
    .sort((a, b) => b.points.length - a.points.length);
}
