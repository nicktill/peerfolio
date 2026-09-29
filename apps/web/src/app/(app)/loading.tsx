import { Skeleton } from "@web/components/ui/skeleton"

/**
 * Shown while a page's code loads on first navigation, before the page can show
 * its own shaped skeleton. Deliberately generic: a title, a hero block, two cards.
 */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy aria-label="Loading">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-56 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2">
        <Skeleton className="h-32 rounded-2xl" />
        <Skeleton className="h-32 rounded-2xl" />
      </div>
    </div>
  )
}
