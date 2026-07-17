import Link from "next/link";

export type View = "gainers" | "losers" | "valuable" | "unconfirmed";

export function parseView(v: string | undefined): View {
  return v === "losers" || v === "valuable" || v === "unconfirmed" ? v : "gainers";
}

export const isMoversView = (v: View) => v === "gainers" || v === "losers";

// Tailwind needs literal class names, so the active styles are spelled out.
// Each tab wears the color of the thing it selects: green rising, red falling,
// gold for value. That's the whole palette doing its job.
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
    active: "border-up/50 bg-up/10 text-up-bright",
  },
  {
    key: "losers",
    icon: "▼",
    label: () => "Top 20 Losers",
    hint: "biggest fallers",
    active: "border-down/50 bg-down/10 text-down-bright",
  },
  {
    key: "valuable",
    icon: "★",
    label: (sealed) => (sealed ? "Most Valuable Sealed" : "Most Valuable"),
    hint: "confirmed prices",
    active: "border-gold/50 bg-gold/10 text-gold-bright",
  },
  {
    key: "unconfirmed",
    icon: "◇",
    label: () => "Unconfirmed",
    hint: "asking price only",
    active: "border-ink-faint/50 bg-panel-hi text-ink",
  },
];

const INACTIVE =
  "border-edge bg-panel text-ink-faint hover:border-ink-faint/40 hover:bg-panel-hi hover:text-ink-dim";

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
            className={`flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center transition-colors ${
              isActive ? t.active : INACTIVE
            }`}
          >
            <span className="font-display text-sm font-bold leading-tight tracking-tight sm:text-base">
              <span className="mr-1.5">{t.icon}</span>
              {t.label(sealed)}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider opacity-70">
              {t.hint}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
