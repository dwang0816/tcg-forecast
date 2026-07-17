import { GAMES } from "@/lib/games";

export interface GameProgress {
  slug: string;
  name: string;
  accent: string;
  todo: number;
  done: number;
}

/**
 * Pick a pile to work through.
 *
 * The counts are the whole point, not decoration. The queue is lopsided — nearly
 * all of it is Pokémon — and a picker that hid that would promise three sessions
 * where there's really one. Showing "1 left" on One Piece sets the expectation
 * before the click rather than after it.
 *
 * Each tile is a finish line: cards left, and how far in you are. A pile at 100%
 * says so and stops competing for attention.
 */
export function GamePicker({
  games,
  selected,
  hrefFor,
}: {
  games: GameProgress[];
  selected: string;
  hrefFor: (game: string) => string;
}) {
  const all = games.reduce(
    (a, g) => ({ todo: a.todo + g.todo, done: a.done + g.done }),
    { todo: 0, done: 0 },
  );

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Tile
        href={hrefFor("all")}
        active={selected === "all"}
        name="Everything"
        todo={all.todo}
        done={all.done}
      />
      {games.map((g) => (
        <Tile
          key={g.slug}
          href={hrefFor(g.slug)}
          active={selected === g.slug}
          name={g.name}
          accent={g.accent}
          todo={g.todo}
          done={g.done}
        />
      ))}
    </div>
  );
}

function Tile({
  href,
  active,
  name,
  accent,
  todo,
  done,
}: {
  href: string;
  active: boolean;
  name: string;
  accent?: string;
  todo: number;
  done: number;
}) {
  const total = todo + done;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const finished = total > 0 && todo === 0;

  return (
    <a
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col gap-2 rounded-xl border p-3 transition-colors ${
        active
          ? "border-gold/50 bg-panel-hi"
          : "border-edge bg-panel hover:border-edge-warm hover:bg-panel-hi"
      }`}
    >
      <div className="flex items-center gap-1.5">
        {accent && (
          <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${accent}`} />
        )}
        <span
          className={`truncate text-xs font-medium ${
            active ? "text-ink" : "text-ink-dim"
          }`}
        >
          {name}
        </span>
      </div>

      <div className="flex items-baseline gap-1.5">
        {finished ? (
          <span className="font-mono text-lg font-semibold text-up-bright">
            done
          </span>
        ) : (
          <>
            <span
              className={`font-mono text-lg font-semibold tabular-nums ${
                active ? "text-ink" : "text-ink-dim"
              }`}
            >
              {todo}
            </span>
            <span className="text-[11px] text-ink-faint">left</span>
          </>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-graphite">
          <div
            className={`h-full rounded-full ${finished ? "bg-up" : "bg-gold"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="font-mono text-[10px] tabular-nums text-ink-faint">
          {pct}%
        </span>
      </div>
    </a>
  );
}

/** Games in registry order, so the picker doesn't reshuffle as counts change. */
export function orderGames(
  counts: Record<string, { todo: number; good: number; bad: number }>,
): GameProgress[] {
  return GAMES.map((g) => {
    const c = counts[g.slug] ?? { todo: 0, good: 0, bad: 0 };
    return {
      slug: g.slug,
      name: g.name,
      accent: g.accent,
      todo: c.todo,
      done: c.good + c.bad,
    };
  });
}
