import type { Metadata } from "next";
import Link from "next/link";
import { Space_Grotesk, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { GameNav } from "@/components/GameNav";
import { Mark } from "@/components/Logo";

// Display face. Everything that's language rather than data.
const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

// Data face: prices, tickers, labels, anything in a column that should line up.
const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "TCG.Forecast — Market signals for cards",
  description:
    "Daily price movers for Pokémon, One Piece, and Riftbound trading cards — biggest gainers and losers, powered by TCGplayer market data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <GameNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>

        <footer className="mt-8 border-t border-edge bg-graphite/60">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center gap-4 px-4 py-8 text-center">
            <span className="flex items-center gap-2.5">
              <Mark size={22} wicks={false} />
              <span className="font-mono text-[10px] tracking-[0.3em] text-ink-faint">
                MARKET SIGNALS FOR CARDS
              </span>
            </span>

            <p className="max-w-xl text-xs leading-relaxed text-ink-faint/70">
              Price data from{" "}
              <a
                href="https://tcgcsv.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-gold/70 underline decoration-gold/30 underline-offset-2 transition-colors hover:text-gold"
              >
                tcgcsv
              </a>{" "}
              (TCGplayer market prices), updated daily. Not affiliated with
              TCGplayer, The Pokémon Company, Bandai, or Riot Games.
            </p>

            {/* The nav link is desktop-only, so this is how phones reach it — and
                a coverage page belongs next to the data provenance anyway. */}
            <Link
              href="/missing-pictures"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-ink-faint/70 transition-colors hover:text-ink-dim"
            >
              Cards we don&apos;t have pictures for
            </Link>
          </div>
        </footer>
      </body>
    </html>
  );
}
