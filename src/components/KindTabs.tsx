import Link from "next/link";
import { Kind } from "@/lib/queries";

export function parseKind(v: string | undefined): Kind {
  return v === "sealed" ? "sealed" : "single";
}

const TABS: { key: Kind; label: string }[] = [
  { key: "single", label: "Singles" },
  { key: "sealed", label: "Sealed Products" },
];

/**
 * Singles vs Sealed within a game. This is the coarser split — it changes WHAT
 * you're looking at — so it sits above the view tabs, which change how it's sliced.
 */
export function KindTabs({
  kind,
  makeHref,
}: {
  kind: Kind;
  makeHref: (k: Kind) => string;
}) {
  return (
    <nav className="inline-flex rounded-lg border border-edge bg-panel p-1">
      {TABS.map((t) => {
        const active = t.key === kind;
        return (
          <Link
            key={t.key}
            href={makeHref(t.key)}
            aria-current={active ? "page" : undefined}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              active
                ? "bg-panel-hi text-ink"
                : "text-ink-faint hover:text-ink-dim"
            }`}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
