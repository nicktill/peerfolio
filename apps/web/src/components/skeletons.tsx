import { Skeleton, SkeletonStat } from "@web/components/ui/skeleton"

/**
 * Loading placeholders shaped like the pages they stand in for (same blocks,
 * same heights, same grid), so when the real content arrives it lands where the
 * skeleton was instead of shoving everything around.
 */

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading your portfolio">
      <div className="flex items-end justify-between gap-3">
        <div>
          <Skeleton className="h-4 w-28" />
          <Skeleton className="mt-3 h-12 w-64" />
        </div>
        <Skeleton className="h-8 w-24 rounded-lg" />
      </div>
      <div className="grid gap-4 [&>*]:min-w-0 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonStat key={i} />
        ))}
      </div>
      <Skeleton className="h-[22rem] rounded-xl" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    </div>
  )
}

/** The Leagues and Fantasy landing pages: a hero card, then a grid of league cards. */
export function LeagueListSkeleton({ hero = true }: { hero?: boolean }) {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading leagues">
      {hero ? <Skeleton className="h-52 rounded-3xl" /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  )
}

/** A single league: header with stats, then the chart and standings beside the trade panel. */
export function LeaguePageSkeleton() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading league">
      <Skeleton className="h-4 w-20" />
      <div className="rounded-3xl border bg-card p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-xl" />
          <div>
            <Skeleton className="h-7 w-48" />
            <Skeleton className="mt-2 h-3.5 w-64" />
          </div>
        </div>
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-[4.25rem] rounded-2xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-6">
          <Skeleton className="h-[21rem] rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-96 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  )
}

export function BoardSkeleton() {
  return (
    <div className="space-y-3" aria-busy aria-label="Loading the board">
      {Array.from({ length: 6 }, (_, i) => (
        <Skeleton key={i} className="h-[4.5rem] rounded-xl" />
      ))}
    </div>
  )
}
