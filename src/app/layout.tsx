import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { GameNav } from "@/components/GameNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TCG Forecast — Trending card prices",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <GameNav />
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
          {children}
        </main>
        <footer className="border-t border-white/5 px-4 py-6 text-center text-xs text-white/30">
          Price data from{" "}
          <a
            href="https://tcgcsv.com"
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-white/50"
          >
            tcgcsv
          </a>{" "}
          (TCGplayer market prices), updated daily. Not affiliated with TCGplayer,
          The Pokémon Company, Bandai, or Riot Games.
        </footer>
      </body>
    </html>
  );
}
