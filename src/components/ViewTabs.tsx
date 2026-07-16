import Link from "next/link";

export type View = "gainers" | "losers" | "valuable" | "unconfirmed";

export function parseView(v: string | undefined): View {
  return v === "losers" || v === "valuable" || v === "unconfirmed" ? v : "gainers";
}

export const isMoversView = (v: View) => v === "gainers" || v === "losers";

// Tailwind needs literal class names, so the active styles are spelled out.
const TABS: {
  key: View;
  icon: string;
  label: (sealed: boolean) => string;
  hint: string;
  active: string;
}[] = [
  {
    key: "gainers",
    icon: "▲",
    label: () => "Top 20 Gainers",
    hint: "biggest risers",
    active: "border-emerald-500/50 bg-emerald-500/15 text-emerald-300",
  },
  {
    key: "losers",
    icon: "▼",
    label: () => "Top 20 Losers",
    hint: "biggest fallers",
    active: "border-rose-500/50 bg-rose-500/15 text-rose-300",
  },
  {
    key: "valuable",
    icon: "★",
    label: (sealed) => (sealed ? "Most Valuable Sealed" : "Most Valuable"),
    hint: "confirmed prices",
    active: "border-amber-500/50 bg-amber-500/15 text-amber-200",
  },
  {
    key: "unconfirmed",
    icon: "◇",
    label: () => "Unconfirmed",
    hint: "asking price only",
    active: "border-white/30 bg-white/10 text-white/85",
  },
];

const INACTIVE =
  "border-white/10 bg-white/[0.02] text-white/45 hover:border-white/20 hover:bg-white/5 hover:text-white/80";

export function ViewTabs({
  view,
  makeHref,
  sealed = false,
}: {
  view: View;
  makeHref: (v: View) => string;
  sealed?: boolean;
}) {
  return (
    <nav className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {TABS.map((t) => {
        const isActive = t.key === view;
        return (
          <Link
            key={t.key}
            href={makeHref(t.key)}
            aria-current={isActive ? "page" : undefined}
            className={`flex flex-col items-center gap-0.5 rounded-xl border px-3 py-3 text-center transition-colors ${
              isActive ? t.active : INACTIVE
            }`}
          >
            <span className="text-sm font-semibold leading-tight sm:text-base">
              <span className="mr-1.5">{t.icon}</span>
              {t.label(sealed)}
            </span>
            <span className="text-[11px] opacity-70">{t.hint}</span>
          </Link>
        );
      })}
    </nav>
  );
}
