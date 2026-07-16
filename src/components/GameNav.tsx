"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { GAMES } from "@/lib/games";

export function GameNav() {
  const pathname = usePathname();

  const links = [
    { href: "/", label: "Home", slug: "" },
    ...GAMES.map((g) => ({ href: `/${g.slug}`, label: g.name, slug: g.slug })),
    { href: "/products", label: "Products", slug: "products" },
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

        <div className="flex items-center gap-1 overflow-x-auto">
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
      </nav>
    </header>
  );
}
