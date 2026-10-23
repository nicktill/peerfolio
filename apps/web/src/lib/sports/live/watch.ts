import { revalidateTag, unstable_cache } from "next/cache"

/**
 * Database-free "someone just opened sports" signal for the live odds worker. The worker polls /api/sports/watch while it sleeps;
 * the answer comes from Next's shared data cache, never from Postgres, so polling cannot wake Neon. A viewer request that stamps
 * the activity row (live/store.ts touchSportsActivity) also invalidates the tag, so the next poll refills the entry with a new mark
 * and the worker wakes within one poll instead of at its next 15-minute slot. Server only (next/cache); the worker never imports it.
 */
const TAG = "sports-watch"

/** Changes after every signal: the time the cache entry was refilled. */
export const watchMark = unstable_cache(async () => new Date().toISOString(), ["sports-watch-v1"], { tags: [TAG] })

/** Never throws: a failed signal only means the worker notices the viewer at its next slot, as before. */
export function signalWatch(): void {
  try {
    revalidateTag(TAG)
  } catch {
    // Outside a request there is nothing to invalidate.
  }
}
