import { TileGridSkeleton, MethodologySkeleton } from "@/components/Skeletons";

/**
 * Shown while navigating INTO a game page from elsewhere (home, a card, search).
 *
 * Tab-to-tab switching doesn't reach here — the page's own keyed Suspense
 * boundary handles that, and keeps the real tabs on screen so the click lands
 * visibly. This is the colder case, where even the tab bar doesn't exist yet, so
 * it stands in for the whole layout.
 */
export default function Loading() {
  return (
    <div className="flex flex-col gap-5" aria-busy>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="h-8 w-56 animate-pulse rounded bg-panel-hi" />
        <div className="h-3 w-64 max-w-full animate-pulse rounded bg-panel-hi" />
      </div>
      {/* Kind tabs */}
      <div className="h-10 w-full animate-pulse rounded-xl bg-panel" />
      {/* View tabs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-14 animate-pulse rounded-xl bg-panel" />
        ))}
      </div>
      <div className="h-6 w-48 animate-pulse rounded bg-panel" />
      <MethodologySkeleton />
      <TileGridSkeleton count={10} />
    </div>
  );
}
