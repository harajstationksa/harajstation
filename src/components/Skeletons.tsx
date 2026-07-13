/**
 * Placeholders shown while a section's data streams in.
 *
 * They mirror the real cards' geometry (aspect-4/3 cover, then price, title and
 * meta rows) — if the outline doesn't match, the page jumps when the data lands,
 * which is worse than waiting for it.
 */

function Bar({ className = "" }: { className?: string }) {
  return <div className={`rounded-md bg-neutral-200/80 ${className}`} />;
}

export function CardSkeleton() {
  return (
    <div className="card overflow-hidden rounded-2xl animate-pulse">
      <div className="aspect-4/3 bg-neutral-200/80" />
      <div className="p-4 space-y-2.5">
        <Bar className="h-6 w-24" /> {/* price */}
        <Bar className="h-4 w-full" /> {/* title */}
        <div className="flex items-center justify-between pt-1">
          <Bar className="h-3 w-20" />
          <Bar className="h-3 w-10" />
        </div>
      </div>
    </div>
  );
}

/** A responsive grid of card placeholders — same columns as the real grids. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {Array.from({ length: count }, (_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}

/** The horizontally-scrolling auction rail. */
export function CardRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="flex gap-3 sm:gap-4 overflow-hidden pb-2 -mx-4 px-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="w-56 sm:w-64 shrink-0">
          <CardSkeleton />
        </div>
      ))}
    </div>
  );
}

export function CategoriesSkeleton() {
  return (
    <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-11 gap-2 sm:gap-3 animate-pulse">
      {Array.from({ length: 11 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2.5 py-2 px-1">
          <div className="size-12 sm:size-14 rounded-2xl bg-neutral-100" />
          <Bar className="h-3 w-12" />
        </div>
      ))}
    </div>
  );
}

export function StatsSkeleton() {
  return (
    <div className="rounded-2xl bg-neutral-900 px-6 py-8 flex items-center justify-around animate-pulse">
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="flex flex-col items-center gap-2">
          <div className="h-8 w-16 rounded-md bg-white/15" />
          <div className="h-3 w-20 rounded-md bg-white/10" />
        </div>
      ))}
    </div>
  );
}

/** Section header + grid, for whole sections that may not exist yet. */
export function SectionSkeleton({ count = 4 }: { count?: number }) {
  return (
    <section>
      <div className="flex items-center justify-between mb-5 animate-pulse">
        <Bar className="h-6 w-40" />
        <Bar className="h-4 w-16" />
      </div>
      <CardGridSkeleton count={count} />
    </section>
  );
}
