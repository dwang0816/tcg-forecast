"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GAMES } from "@/lib/games";
import { Mark, Wordmark } from "@/components/Logo";

export function GameNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-edge bg-graphite/85 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-2 px-4 py-3">
        <Link href="/" className="mr-2 flex shrink-0 items-center gap-2.5">
          <Mark size={26} />
          <Wordmark className="text-base" />
        </Link>

        {/* The accent dot rides in the tab itself: this is the only place the
            games appear side by side, so it's where the color coding has to be
            learnable. */}
        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {GAMES.map((game) => {
            const active = pathname === `/${game.slug}`;
            return (
              <Link
                key={game.slug}
                href={`/${game.slug}`}
                aria-current={active ? "page" : undefined}
                className={`flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-panel-hi text-ink"
                    : "text-ink-faint hover:bg-panel hover:text-ink-dim"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-2 w-2 shrink-0 rounded-full transition-opacity ${game.accent} ${
                    active ? "opacity-100" : "opacity-50"
                  }`}
                />
                {game.name}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1">
          {/* Quieter than the games and the search button on purpose: it's a
              reference page for the curious, not somewhere to send people first. */}
          <Link
            href="/missing-pictures"
            aria-current={pathname === "/missing-pictures" ? "page" : undefined}
            className={`hidden rounded-full px-3 py-1.5 font-mono text-[11px] uppercase tracking-wider transition-colors md:inline ${
              pathname === "/missing-pictures"
                ? "bg-panel-hi text-ink-dim"
                : "text-ink-faint/70 hover:bg-panel hover:text-ink-faint"
            }`}
          >
            Missing pictures
          </Link>

          {/* A labelled destination rather than a bare input: a lone search box
              doesn't tell anyone WHAT it searches. This says where to go to look
              up one specific card's price and details. */}
          <Link
            href="/search"
            aria-current={pathname === "/search" ? "page" : undefined}
            className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
              pathname === "/search"
                ? "border-gold/50 bg-gold/10 text-gold-bright"
                : "border-edge text-ink-dim hover:border-gold/40 hover:bg-gold/[0.06] hover:text-gold-bright"
            }`}
          >
            <span aria-hidden className="text-base leading-none">
              ⌕
            </span>
            <span className="hidden sm:inline">Look up a card</span>
            <span className="sm:hidden">Search</span>
          </Link>
        </div>
      </nav>
    </header>
  );
}
