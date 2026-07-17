import {
  confidenceTier,
  spreadRatio,
  CONFIDENCE_LABEL,
} from "@/lib/confidence";

// Not the value palette: gold means "worth money", and a mid-confidence badge
// isn't making a claim about worth. This is the movement palette dimmed.
const STYLES: Record<string, string> = {
  high: "bg-up/10 text-up",
  medium: "bg-ink-faint/10 text-ink-dim",
  low: "bg-down/10 text-down-bright",
};

const TEXT: Record<string, string> = {
  high: "confident",
  medium: "unsettled",
  low: "wide spread",
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
      {TEXT[tier]} · {ratio.toFixed(1)}x
    </span>
  );
}
