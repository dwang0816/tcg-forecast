import {
  confidenceTier,
  spreadRatio,
  CONFIDENCE_LABEL,
  CONFIDENCE_TEXT,
} from "@/lib/confidence";

// A traffic light: green agree, yellow unsettled, red nobody knows.
//
// The middle tier used to be grey, on the rule that gold is the value/premium colour
// and a confidence badge makes no claim about worth (see globals.css). That rule was
// already broken by the one component whose job is explaining this badge —
// MethodologyNote paints the 55% and 65% confidence weights gold — so the badge was
// the odd one out, and grey read as "no signal" rather than "middling signal".
// Gold means "caution" here and in the note; it still never means "warning".
const STYLES: Record<string, string> = {
  high: "bg-up/10 text-up",
  medium: "bg-gold/10 text-gold-bright",
  low: "bg-down/10 text-down-bright",
};

/**
 * Shows how settled a card's price is, derived from the listing spread.
 * Renders nothing when we have no spread to judge by — better silent than
 * implying a confidence we can't back up.
 */
export function ConfidenceBadge({
  low,
  high,
}: {
  low: number | null;
  high: number | null;
}) {
  const ratio = spreadRatio(low, high);
  if (ratio == null) return null;

  const tier = confidenceTier(low, high);
  return (
    <span
      title={`${CONFIDENCE_LABEL[tier]} (low $${low} – high $${high}, ${ratio.toFixed(1)}x)`}
      className={`rounded px-1.5 py-0.5 font-mono text-[10px] tabular-nums ${STYLES[tier]}`}
    >
      {CONFIDENCE_TEXT[tier]} · {ratio.toFixed(1)}x
    </span>
  );
}
