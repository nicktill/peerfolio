/**
 * "Someone is on the sports pages" signal. Viewer requests stamp one row (live_worker, name below; no schema change) at most once a
 * minute per server instance; the worker reads it only when a repricing pass is due. Without a recent stamp the near-kickoff 30 second
 * pass would only keep the database awake for nobody, so the worker reprices once per shared slot instead (see reprice-pass.ts).
 */
export const ACTIVITY_NAME = "sports-activity"
/** Viewed within this long ago counts as watched. The page polls every 20s (stamped at most once a minute), so an open page keeps it fresh and a closed one stops costing database time after about 3 minutes. */
export const ACTIVITY_WINDOW_MS = 3 * 60_000
/** At most one stamp per instance in this interval. */
export const ACTIVITY_TOUCH_MS = 60_000

export const isWatched = (lastAt: Date | null, now: Date): boolean => lastAt != null && now.getTime() - lastAt.getTime() < ACTIVITY_WINDOW_MS
