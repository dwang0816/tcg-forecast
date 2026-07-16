import Link from "next/link";
import { GameSlug } from "@/lib/games";

export type View = "gainers" | "losers" | "valuable";

export const WINDOWS = [
  { days: 1, label: "24h" },
  { days: 7, label: "7d" },
  { days: 30, label: "30d" },
];

const VIEWS: { key: View; label: string }[] = [
  { key: "gainers", label: "▲ Gainers" },
  { key: "losers", label: "▼ Losers" },
  { key: "valuable", label: "★ Most Valuable" },
];

function pill(active: boolean) {
  return `rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
    active
      ? "bg-white text-black"
      : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
  }`;
}

export function Controls({
  game,
  view,
  windowDays,
}: {
  game: GameSlug;
  view: View;
  windowDays: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex flex-wrap gap-1.5">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={`/${game}?view=${v.key}&window=${windowDays}`}
            className={pill(view === v.key)}
          >
            {v.label}
          </Link>
        ))}
      </div>

      {view !== "valuable" && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs uppercase tracking-wide text-white/30">
            Period
          </span>
          {WINDOWS.map((w) => (
            <Link
              key={w.days}
              href={`/${game}?view=${view}&window=${w.days}`}
              className={pill(windowDays === w.days)}
            >
              {w.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
