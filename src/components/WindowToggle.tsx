import Link from "next/link";

export const WINDOWS = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
];

export function WindowToggle({
  windowDays,
  makeHref,
}: {
  windowDays: number;
  makeHref: (days: number) => string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="kicker">Period</span>
      {WINDOWS.map((w) => {
        const active = windowDays === w.days;
        return (
          <Link
            key={w.days}
            href={makeHref(w.days)}
            className={`rounded-full px-3.5 py-2 font-mono text-xs font-semibold transition-colors ${
              active
                ? "bg-gold text-graphite"
                : "bg-panel text-ink-faint hover:bg-panel-hi hover:text-ink-dim"
            }`}
          >
            {w.label}
          </Link>
        );
      })}
    </div>
  );
}
