import { Game } from "@/lib/games";

/**
 * The game's name behind its accent dot.
 *
 * The dot carries the color and the pill stays graphite, which is the whole
 * trick: the accents are the games' own colors (Pokémon yellow, One Piece red),
 * so we can't put text on them and know it will be readable. On a 9px dot that
 * never comes up, and the pill is our own surface with our own contrast.
 */
export function GameTag({
  game,
  size = "md",
  className = "",
}: {
  game: Game;
  /** "sm" is for badges over card art, where space is borrowed from the image. */
  size?: "sm" | "md";
  className?: string;
}) {
  const sm = size === "sm";
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border border-edge bg-graphite/85 font-mono text-ink-dim backdrop-blur ${
        sm ? "gap-1.5 px-2 py-0.5 text-[9px]" : "gap-2 px-3 py-1.5 text-[11px]"
      } ${className}`}
    >
      <span
        aria-hidden
        className={`shrink-0 rounded-full ${game.accent} ${sm ? "h-2 w-2" : "h-2.5 w-2.5"}`}
      />
      {game.name.toUpperCase()}
    </span>
  );
}
