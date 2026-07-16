// Central registry of the trading card games we track.
// Category ids are TCGplayer's, mirrored by tcgcsv.

export type GameSlug = "pokemon" | "onepiece" | "riftbound";
export type Language = "EN" | "JP";

export const LANGUAGES: Language[] = ["EN", "JP"];

export interface Game {
  slug: GameSlug;
  name: string;
  /**
   * TCGplayer category per language. Only Pokémon has a Japanese catalog on
   * TCGplayer ("Pokemon Japan", 448 groups); One Piece and Riftbound are sold
   * English-only there, so they have no JP entry and get no language toggle.
   */
  categories: { EN: number; JP?: number };
  /** Tailwind accent classes for this game's theming. */
  accent: string;
  accentText: string;
}

export const GAMES: Game[] = [
  {
    slug: "pokemon",
    name: "Pokémon",
    categories: { EN: 3, JP: 85 },
    accent: "bg-amber-500",
    accentText: "text-amber-500",
  },
  {
    slug: "onepiece",
    name: "One Piece",
    categories: { EN: 68 },
    accent: "bg-rose-500",
    accentText: "text-rose-500",
  },
  {
    slug: "riftbound",
    name: "Riftbound",
    categories: { EN: 89 },
    accent: "bg-indigo-500",
    accentText: "text-indigo-500",
  },
];

export const GAME_BY_SLUG: Record<GameSlug, Game> = Object.fromEntries(
  GAMES.map((g) => [g.slug, g]),
) as Record<GameSlug, Game>;

export function isGameSlug(value: string): value is GameSlug {
  return value === "pokemon" || value === "onepiece" || value === "riftbound";
}

export function parseLanguage(value: string | undefined): Language {
  return value === "JP" ? "JP" : "EN";
}

/** TCGplayer category id for a game in a language, or undefined if none exists. */
export function categoryFor(game: Game, language: Language): number | undefined {
  return language === "JP" ? game.categories.JP : game.categories.EN;
}

/** Does TCGplayer carry a Japanese catalog for this game? */
export function hasJapanese(game: Game): boolean {
  return game.categories.JP != null;
}

/** Every (game, language) pair we can actually ingest. */
export function allGameLanguages(): { game: Game; language: Language }[] {
  const out: { game: Game; language: Language }[] = [];
  for (const game of GAMES) {
    for (const language of LANGUAGES) {
      if (categoryFor(game, language) != null) out.push({ game, language });
    }
  }
  return out;
}

/** All TCGplayer category ids we ingest (used by the backfill archive reader). */
export function allCategoryIds(): number[] {
  return allGameLanguages().map(({ game, language }) => categoryFor(game, language)!);
}
