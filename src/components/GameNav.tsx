"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GAMES } from "@/lib/games";

export function GameNav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home", slug: "" },
    ...GAMES.map((g) => ({ href: `/${g.slug}`, label: g.name, slug: g.slug })),
  ];

  return (
    <header className="sticky top-0 z-20 border-b border-white/10 bg-[#07070a]/80 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-1 px-4 py-3">
        <Link href="/" className="mr-3 flex items-center gap-2">
          <span className="text-lg">📈</span>
          <span className="text-sm font-semibold tracking-tight text-white">
            TCG Forecast
          </span>
        </Link>

        <div className="flex flex-1 items-center gap-1 overflow-x-auto">
          {links.slice(1).map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/50 hover:bg-white/5 hover:text-white/80"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* A labelled destination rather than a bare input: a lone search box
            doesn't tell anyone WHAT it searches. This says where to go to look
            up one specific card's price and details. */}
        <Link
          href="/search"
          aria-current={pathname === "/search" ? "page" : undefined}
          className={`ml-auto flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
            pathname === "/search"
              ? "border-white/25 bg-white/10 text-white"
              : "border-white/10 text-white/55 hover:border-white/20 hover:bg-white/5 hover:text-white"
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            ⌕
          </span>
          <span className="hidden sm:inline">Look up a card</span>
          <span className="sm:hidden">Search</span>
        </Link>
      </nav>
    </header>
  );
}
