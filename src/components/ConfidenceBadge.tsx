import {
  confidenceTier,
  spreadRatio,
  CONFIDENCE_LABEL,
} from "@/lib/confidence";

const STYLES: Record<string, string> = {
  high: "bg-emerald-500/15 text-emerald-400/90",
  medium: "bg-amber-500/15 text-amber-400/90",
  low: "bg-rose-500/15 text-rose-400/90",
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
      className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STYLES[tier]}`}
    >
      {TEXT[tier]} · {ratio.toFixed(1)}x
    </span>
  );
}
