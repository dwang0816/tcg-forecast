/**
 * Placeholders shown while a view streams in.
 *
 * They mirror the real layout — same grid, same tile proportions, same heights —
 * so the page doesn't jump when the data lands. A centred spinner would be less
 * work and worse: it throws away the shape of what's coming and guarantees a
 * reflow.
 *
 * aria-hidden throughout, with the live region left to the real content: a screen
 * reader shouldn't have to listen to a description of nothing.
 */

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-white/[0.06] ${className}`}
      aria-hidden
    />
  );
}

/** One card tile: image block, name, identity lines, price row. */
function TileSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]">
      <div className="aspect-[5/7] animate-pulse bg-white/[0.05]" aria-hidden />
      <div className="flex flex-col gap-2 p-3">
        <Shimmer className="h-4 w-3/4" />
        <Shimmer className="h-3 w-1/2" />
        <Shimmer className="h-3 w-2/3" />
        <div className="mt-2 flex items-end justify-between">
          <Shimmer className="h-5 w-16" />
          <Shimmer className="h-8 w-14" />
        </div>
      </div>
    </div>
  );
}

/** A grid of tiles, matching MoversSection / ValueSection's own grid exactly. */
export function TileGridSkeleton({ count = 10 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between border-b border-white/10 pb-2">
        <Shimmer className="h-6 w-44" />
        <Shimmer className="h-3 w-56" />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: count }).map((_, i) => (
          <TileSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

/** The methodology note above the movers lists. */
export function MethodologySkeleton() {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <Shimmer className="h-5 w-52" />
      <Shimmer className="mt-2 h-3 w-72" />
      <Shimmer className="mt-4 h-20 w-full rounded-xl" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Shimmer className="h-20 rounded-xl" />
        <Shimmer className="h-20 rounded-xl" />
        <Shimmer className="h-20 rounded-xl" />
      </div>
    </div>
  );
}

/** The "N products · data through … · N days tracked" line in the header. */
export function StatsLineSkeleton() {
  return <Shimmer className="h-3 w-64" />;
}

/** Whole-view fallback: methodology (movers views only) plus the grid. */
export function ViewSkeleton({ withMethodology }: { withMethodology: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      {withMethodology && <MethodologySkeleton />}
      <TileGridSkeleton count={10} />
    </div>
  );
}
