import Link from "next/link";
import { Language } from "@/lib/games";

const OPTIONS: { key: Language; label: string; sub: string }[] = [
  { key: "EN", label: "English", sub: "EN" },
  { key: "JP", label: "Japanese", sub: "JP" },
];

/**
 * EN/JP switch. Only rendered for games where TCGplayer actually has a Japanese
 * catalog (Pokémon). One Piece and Riftbound are English-only there, so showing
 * a JP option would just lead to an empty page.
 */
export function LanguageToggle({
  language,
  makeHref,
}: {
  language: Language;
  makeHref: (l: Language) => string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="kicker">Language</span>
      {OPTIONS.map((o) => {
        const active = o.key === language;
        return (
          <Link
            key={o.key}
            href={makeHref(o.key)}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-3.5 py-1.5 font-mono text-xs font-semibold transition-colors ${
              active
                ? "bg-gold text-graphite"
                : "bg-panel text-ink-faint hover:bg-panel-hi hover:text-ink-dim"
            }`}
          >
            {o.label}
          </Link>
        );
      })}
    </div>
  );
}
