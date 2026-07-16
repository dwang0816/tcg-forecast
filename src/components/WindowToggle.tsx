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
      <span className="text-xs uppercase tracking-wide text-white/30">Period</span>
      {WINDOWS.map((w) => {
        const active = windowDays === w.days;
        return (
          <Link
            key={w.days}
            href={makeHref(w.days)}
            className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "bg-white text-black"
                : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {w.label}
          </Link>
        );
      })}
    </div>
  );
}
