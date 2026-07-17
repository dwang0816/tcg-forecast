import { percent, percentPlain } from "@/lib/format";
import { convictionTier, type MoveScore } from "@/lib/conviction";

/**
 * Same traffic light as ConfidenceBadge, and deliberately so: on a tile where both
 * sit in the same column, one palette has to mean one thing. Green believe it,
 * yellow middling, red barely.
 */
export const CONVICTION_STYLES: Record<string, string> = {
  high: "text-up",
  medium: "text-gold-bright",
  low: "text-down-bright",
};

/**
 * Why this card sits where it does on the movers list.
 *
 * The list used to rank by `pctChange * spreadFactor` and show neither number, so
 * the order looked arbitrary the moment you left the movers page — MethodologyNote
 * carried a whole section apologising for it. This is that apology replaced with the
 * actual figure.
 *
 * The score leads because it is what the list is sorted by; anything else on top
 * would be pointing at a number that isn't doing the ranking. The paced line appears
 * only when pacing changed the story, which makes it self-explaining: it shows up
 * exactly on the cards where the headline percentage isn't what it looks like.
 *
 * The subtext is conviction, and it's deliberately NOT the weakest damper's name.
 * That was the first cut, and it had two problems. It read as a description OF the
 * score rather than a deduction FROM it ("75.6 moderate spread" looks like a label,
 * not a penalty). And it duplicated the ConfidenceBadge sitting beside it: 14 of the
 * 20 cards on the Pokémon 7d gainers had a spread damper as their weakest, so most
 * tiles said the spread twice, in two vocabularies, and the badge said it better —
 * it has the actual ratio. Conviction is the number the score is built from and the
 * one thing here the badge cannot say, so it's what earns the space. The dampers
 * still get named, in the tooltip.
 */
export function MoveScoreBadge({ move, windowDays }: { move: MoveScore; windowDays: number }) {
  const up = move.score >= 0;

  const title = [
    `Score ${Math.abs(move.score).toFixed(1)} of 99.9 — how this card is ranked.`,
    "",
    move.paced
      ? `This price hadn't been updated in a while: the move really spans ${move.effectiveDays} days, ` +
        `which is ${percentPlain(move.pacedPct)} per ${windowDays} days rather than ${percentPlain(move.rawPct)}.`
      : `The move covers the full ${windowDays} days — no stale price to correct for.`,
    "",
    `Conviction ${move.conviction.toFixed(0)} of 100 — how much of that we believe:`,
    ...move.dampers.map((d) => `  • ${d.label} (x${d.factor}) — ${d.detail}`),
    "",
    `Holding it back most: ${move.weakest.label}.`,
  ].join("\n");

  return (
    <span
      title={title}
      className="flex items-center gap-1.5 font-mono text-[10px] tabular-nums text-ink-faint"
    >
      <span
        className={`rounded px-1.5 py-0.5 font-semibold ${
          up ? "bg-up/10 text-up" : "bg-down/10 text-down-bright"
        }`}
      >
        {Math.abs(move.score).toFixed(1)}
      </span>
      {/* Coloured by how much we believe it, NOT by which way the card moved: the
          score badge beside it already wears the direction, and on a gainers list
          every tile is green, so a direction-coloured conviction would carry no
          information at all. Here the colour IS the reading. */}
      <span className={`truncate ${CONVICTION_STYLES[convictionTier(move.conviction)]}`}>
        {Math.round(move.conviction)}% believed
      </span>
    </span>
  );
}

/**
 * The correction line: "really +21% per 7d over 97 days".
 *
 * Separate from the badge because it belongs next to the percentage it's correcting,
 * not next to the score. Renders nothing when there's nothing to correct.
 */
export function PacedNote({ move, windowDays }: { move: MoveScore; windowDays: number }) {
  if (!move.paced) return null;
  return (
    <span
      className="font-mono text-[9px] font-normal text-ink-faint"
      title={
        `The market price behind this card hadn't moved in ${move.effectiveDays - windowDays} days before ` +
        `this window opened, so the jump is that whole stretch catching up at once — not ${windowDays} days of movement. ` +
        `Spread over the ${move.effectiveDays} days it really covers, it's ${percentPlain(move.pacedPct)} per ${windowDays} days.`
      }
    >
      {/* Signed, not magnitude: this sits directly under the signed headline inside
          the same box, and "-74.3%" above a bare "44.9%" reads like a gain. */}
      ≈{percent(move.pacedPct)} / {windowDays}d over {move.effectiveDays}d
    </span>
  );
}
