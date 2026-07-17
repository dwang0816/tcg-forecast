/**
 * Why is this card the top gainer?
 *
 * The old answer was `pctChange * spreadFactor`, ordered in SQL. One multiply, no
 * name, shown nowhere — so off the movers page the ranking looked arbitrary, and
 * MethodologyNote had to carry a whole section apologising for it.
 *
 * It also ranked fiction. TCGplayer's market price only recomputes when a copy
 * sells, so an illiquid card's price is a step function: frozen for weeks, then a
 * lurch. Charizard ex held $500 for 90+ days while every listing asked $1,700, then
 * "gained 240% in a day" when one finally sold. The spread factor could not catch
 * that — those listings all agreed on $1,700, so its confidence was *high*. It sat
 * at #4 on the real gainers list.
 *
 * The fix isn't a bigger fudge factor. Measured against live data, no damper you
 * can justify demotes a +240%: even a brutal 0.15x leaves it beating a believable
 * +42%. So this module splits the question in two:
 *
 *   PACE       restate the move over the days it really took. A price flat 90 days
 *              that lurches +240% did not gain 240% in a week — it gained ~10% per
 *              week for 90 days. Arithmetic, not judgement.
 *   CONVICTION how much of that paced move we believe: spread x typicality, each a
 *              0..1 damper with a name the UI can print.
 *
 * score = 99.9 * tanh(pacedPct * conviction), signed. Losers are the same number
 * read from the bottom — a big drop we believe outranks a bigger drop we don't.
 *
 * This file is the ONLY place the ranking formula lives. It used to exist three
 * times (SQL in queries.ts, TS in confidence.ts, and reconstructed client-side in
 * MethodologyNote) kept in sync by hand and enforced by nothing. getMovers now
 * shortlists in SQL and ranks by calling in here, so there is one copy.
 */

import {
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT,
  confidenceFactor,
  confidenceTier,
  spreadRatio,
  type ConfidenceTier,
} from "./confidence";

export type DamperKey = "spread" | "typicality";

export interface Damper {
  key: DamperKey;
  /** 0..1. Conviction is the product of these. */
  factor: number;
  /** Short, for a badge. */
  label: string;
  /** Long, for a tooltip — says what was measured, not just the verdict. */
  detail: string;
}

export interface MoveScoreInput {
  /** The window the list claims to cover (1 | 7 | 30). */
  windowDays: number;
  /** (cur - prev) / prev, as a fraction. Signed. */
  rawPct: number;
  /** Today's listing band, for the spread damper. */
  low: number | null;
  high: number | null;
  /** Days the price sat at `prev` before it moved. See FLAT_CAP_DAYS. */
  flatDaysBefore: number | null;
  /** Stddev of daily returns BEFORE this window. See volatilityBefore(). */
  volatility: number | null;
}

export interface MoveScore {
  /** What the card actually did. Always display this — it's what happened. */
  rawPct: number;
  /** rawPct restated as a per-window rate over the days it really took. */
  pacedPct: number;
  /** Days the move really spans — how old `prevPrice` actually is. */
  effectiveDays: number;
  /**
   * Whether pacing changed the story enough to be worth showing.
   *
   * Not just `effectiveDays > windowDays`: almost every card has *some* flat run
   * (p50 is 9 days), so that flag would be true nearly always and the UI would print
   * a correction line on every tile — noise that buries the cards where it matters.
   * This is true only once the correction moves the number by a tenth or more.
   */
  paced: boolean;
  /** 0..100. */
  conviction: number;
  dampers: Damper[];
  /** The damper hurting most — the one worth showing when there's room for one. */
  weakest: Damper;
  /** The ranking key. Signed, (-99.9, 99.9). */
  score: number;
}

/**
 * Ceiling on flatDaysBefore, and therefore on how deep getMovers pulls history.
 *
 * Measured, not guessed. Real flat runs on Pokémon singles reach 273 days (p50=9,
 * p90=69, p99=177), but pacing saturates long before that: at a 60-day cap the top
 * 20 is already bit-for-bit identical to an uncapped 400-day pull, because 7/61 and
 * 7/274 both round a card to the bottom of the list. 90 is 60 with margin.
 *
 * The cap is what keeps stage 2 affordable: 97 days of history for the shortlist is
 * a fast query, 400 days is 233k rows and 5.5s. Capping is also conservative in the
 * safe direction — under-measuring a flat run under-corrects, so a stale card can
 * only rank too HIGH, never too low, and never sneaks in on an inflated correction.
 */
export const FLAT_CAP_DAYS = 90;

/** History depth stage 2 needs: the pacing cap, plus the window itself. */
export const HISTORY_DAYS = FLAT_CAP_DAYS + 30;

/**
 * The window the score is calibrated against.
 *
 * pacedPct is a rate *per window*, so its natural size scales with the window — and
 * a fixed tanh scale therefore can't fit all three tabs. Measured: a flat k=1 gives
 * the 7-day tab a healthy 98.2..25 spread, but leaves the 1-day tab's top score at
 * 12.0 (the whole list crammed into single digits, most of the range unused) and
 * PINS four cards on the 30-day tab at 99.9, where a reader sees a four-way tie for
 * first that isn't a tie at all.
 *
 * Dividing the tanh input by the window fixes both by putting every tab on a weekly
 * footing, so a 60 means roughly the same pace whichever tab you're on. It cannot
 * reorder anything: 7/windowDays is a constant within a tab, and tanh is monotonic,
 * so this only decides where the 0..99.9 range spends its resolution.
 *
 * At the 7-day reference this is exactly k=1, which is also within a few tenths of
 * the raw product below ~30% — so where most cards live the score still reads like
 * a believed percentage.
 */
const REFERENCE_DAYS = 7;

/**
 * How long the move really took: how old `prevPrice` actually is.
 *
 * The window says we're comparing today against a snapshot `windowDays` back. But
 * that snapshot is only a *reading* of the price — the price itself was set by the
 * last sale before it, which may be far older. If a card sat flat for 18 days before
 * the window even opened, then `prevPrice` was set 18 + windowDays ago, and that is
 * the span the move actually covers.
 *
 * So the flat run is *added* to the window, not compared against it. An earlier cut
 * of this used max(windowDays, flat + 1) — "was the run longer than the window?" —
 * which is the wrong question and measurably so: it left Rocket's Suicune's +1650%
 * completely uncorrected on the 30-day tab, because its 18-day pre-window flat run
 * looked "shorter than the window" and got discarded, when in fact 18 days of that
 * drift predated the window entirely. Adding also removes the cliff that rule had at
 * flat == windowDays: pacing is now continuous, and a card with a fresh price (flat
 * 0) still gets exactly its window back, so nothing is corrected that shouldn't be.
 *
 * Conservative in the safe direction: the move landed somewhere between prevDate and
 * today, so this can only over-state the span by up to windowDays, and over-stating
 * pushes a card DOWN. A stale price can rank too low, never too high.
 */
function effectiveDays(windowDays: number, flatDaysBefore: number | null): number {
  return windowDays + Math.min(flatDaysBefore ?? 0, FLAT_CAP_DAYS);
}

/**
 * The move restated as a per-window rate. Geometric, so it composes: +240% over 90
 * days is the same claim as +10%/week for 90 days.
 *
 * Works unchanged for losers — a -50% over 30 days pacs to -14.9%/week, right sign,
 * no special case — because rawPct > -1 always holds (a price can't go negative).
 * rawPct === -1 exactly (price to zero) gives 0^x = 0 => -100%, which is correct.
 */
function paceMove(rawPct: number, windowDays: number, effDays: number): number {
  return Math.pow(1 + rawPct, windowDays / effDays) - 1;
}

/**
 * Damper for a card with no listing band at all.
 *
 * Deliberately NOT confidenceFactor's 0.5 for this case. That 0.5 was invisible —
 * ConfidenceBadge renders nothing when the spread is null, so these cards were
 * silently mid-ranked with nothing on screen to explain why. Conviction is always
 * shown, so the number now has to be one we can defend out loud: 0.6 sits just above
 * the "wide spread" tier, because not knowing is a weaker claim against a card than
 * measuring genuine disagreement. confidenceFactor keeps its 0.5 for the badge path.
 */
const UNKNOWN_SPREAD = 0.6;

/**
 * Wording comes from confidence.ts, not from here.
 *
 * The factor keeps its four levels (1 / 0.8 / 0.55 / 0.3) because ranking wants that
 * resolution, but the *name* collapses to the badge's three tiers so the two can
 * never contradict each other on the same tile. An earlier cut wrote its own four
 * labels and immediately disagreed with the badge sitting beside it — the badge said
 * "confident · 3.2x" while this said "Moderate spread" about the very same card.
 */
function spreadDamper(low: number | null, high: number | null): Damper {
  const ratio = spreadRatio(low, high);
  if (ratio == null) {
    return {
      key: "spread",
      factor: UNKNOWN_SPREAD,
      label: "spread unknown",
      detail: "No copies listed today — we can't tell how much sellers agree.",
    };
  }
  const tier = confidenceTier(low, high);
  return {
    key: "spread",
    factor: confidenceFactor(low, high),
    label: CONFIDENCE_TEXT[tier],
    detail: `${CONFIDENCE_LABEL[tier]} (priciest copy is ${ratio.toFixed(1)}x the cheapest).`,
  };
}

/**
 * Volatility thresholds.
 *
 * The first three mirror the steady / moves-a-bit / jumpy language already used on
 * the card page, so the two pages describe a card the same way. The fourth is new
 * and came out of the data: baseline volatility has a monstrous tail (p90=0.094 but
 * max=10.05 — a Pikachu whose daily returns have 1000% stddev). Three buckets filed
 * vol=0.09 and vol=10.05 under the same 0.65, which let pure noise reach #20 with a
 * conviction of 52. Cards past 0.25 aren't jumpy, they're unrankable.
 */
const ERRATIC = 0.25;

// Lowercase, like CONFIDENCE_TEXT — these two sets of labels get printed in the same
// sentences and the same tooltips, so they have to look like one vocabulary.
function typicalityDamper(volatility: number | null): Damper {
  if (volatility == null)
    return {
      key: "typicality",
      factor: 0.85,
      label: "short history",
      detail: "Too few price moves yet to tell whether this is normal for this card.",
    };
  const v = `${(volatility * 100).toFixed(1)}%`;
  if (volatility < 0.02)
    return { key: "typicality", factor: 1, label: "usually steady", detail: `Normally moves ${v} a day — this is out of character.` };
  if (volatility < 0.08)
    return { key: "typicality", factor: 0.85, label: "moves a bit", detail: `Normally moves ${v} a day.` };
  if (volatility < ERRATIC)
    return { key: "typicality", factor: 0.65, label: "usually jumpy", detail: `Normally swings ${v} a day — big moves are routine here.` };
  return {
    key: "typicality",
    factor: 0.35,
    label: "erratic",
    detail: `Swings ${v} a day on average — this price is closer to noise than a trend.`,
  };
}

/**
 * Bucket a 0..100 conviction for colouring — green believe it, yellow middling, red
 * barely. Same boundaries as confidenceTier, so a card whose conviction is carried
 * entirely by its spread gets the same colour in both places rather than two
 * different verdicts on one tile. MethodologyNote had these thresholds inline; they
 * live here now so the note and the tile can't drift apart.
 */
export function convictionTier(conviction: number): ConfidenceTier {
  if (conviction >= 80) return "high";
  if (conviction >= 55) return "medium";
  return "low";
}

/** Score one mover. The whole ranking formula, in one place. */
export function moveScore(input: MoveScoreInput): MoveScore {
  const { windowDays, rawPct, low, high, flatDaysBefore, volatility } = input;

  const effDays = effectiveDays(windowDays, flatDaysBefore);
  const pacedPct = paceMove(rawPct, windowDays, effDays);

  const dampers = [spreadDamper(low, high), typicalityDamper(volatility)];
  const factor = dampers.reduce((c, d) => c * d.factor, 1);
  const weakest = dampers.reduce((a, b) => (b.factor < a.factor ? b : a));

  return {
    rawPct,
    pacedPct,
    effectiveDays: effDays,
    paced: Math.abs(pacedPct) < Math.abs(rawPct) * 0.9,
    conviction: factor * 100,
    dampers,
    weakest,
    score: squash(pacedPct * factor, windowDays),
  };
}

function squash(believedPct: number, windowDays: number): number {
  return 99.9 * Math.tanh((believedPct * REFERENCE_DAYS) / windowDays);
}

/**
 * The best score a card with this raw move could possibly earn.
 *
 * Load-bearing for the two-stage query. Pacing only ever shrinks |move| and every
 * damper is <= 1, so |score| <= squash(|rawPct|). That makes raw % a valid upper
 * bound, which is what lets stage 1 shortlist in SQL by raw % and still be a true
 * superset of the final top N — without it the shortlist would be a guess.
 */
export function scoreCeiling(rawPct: number, windowDays: number): number {
  return squash(Math.abs(rawPct), windowDays);
}
