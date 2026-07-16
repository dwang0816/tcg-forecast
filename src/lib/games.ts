// Central registry of the trading card games we track.
// `categoryId` is TCGplayer's category id, mirrored by tcgcsv.

export type GameSlug = "pokemon" | "onepiece" | "riftbound";

export interface Game {
  slug: GameSlug;
  name: string;
  categoryId: number;
  /** Tailwind accent classes for this game's theming. */
  accent: string;
  accentText: string;
}

export const GAMES: Game[] = [
  {
    slug: "pokemon",
    name: "Pokémon",
    categoryId: 3,
    accent: "bg-amber-500",
    accentText: "text-amber-500",
  },
  {
    slug: "onepiece",
    name: "One Piece",
    categoryId: 68,
    accent: "bg-rose-500",
    accentText: "text-rose-500",
  },
  {
    slug: "riftbound",
    name: "Riftbound",
    categoryId: 89,
    accent: "bg-indigo-500",
    accentText: "text-indigo-500",
  },
];

export const GAME_BY_SLUG: Record<GameSlug, Game> = Object.fromEntries(
  GAMES.map((g) => [g.slug, g]),
) as Record<GameSlug, Game>;

export const GAME_BY_CATEGORY: Record<number, Game> = Object.fromEntries(
  GAMES.map((g) => [g.categoryId, g]),
);

export function isGameSlug(value: string): value is GameSlug {
  return value === "pokemon" || value === "onepiece" || value === "riftbound";
}
