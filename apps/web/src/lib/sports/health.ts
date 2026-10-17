/** Cron health distinguishes ordinary empty schedules/budget skips from provider outages. */
export function publicationHealth(rows: { rejected: string | null; notes: string[] }[]) {
  const failed = rows.filter((row) => row.notes.some((note) => note.includes(": failed (")))
  // Exchange mode: a sport whose fetch threw is "fetch_failed". Down only when nothing that tried to fetch got through.
  const tried = rows.filter((row) => !row.notes.some((note) => note.startsWith("no fetch")))
  const allFetchesFailed = failed.length > 0 && failed.every((row) => row.rejected === "fetch_failed") && failed.length === tried.length
  const unavailable = failed.some((row) => row.rejected === "stale_snapshot") || allFetchesFailed
  const budgetLimited = rows.some((row) => row.notes.some((note) => note.includes(": skipped, credit pace") || note.includes(": skipped, call cap")))
  return { status: unavailable ? "unavailable" : failed.length ? "degraded" : budgetLimited ? "budget_limited" : "ok", httpStatus: unavailable ? 503 : 200, failedSports: failed.length, budgetLimited } as const
}
