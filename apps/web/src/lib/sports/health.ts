/** Cron health distinguishes ordinary empty schedules/budget skips from provider outages. */
export function publicationHealth(rows: { rejected: string | null; notes: string[] }[]) {
  const failed = rows.filter((row) => row.notes.some((note) => note.includes(": failed (")))
  const unavailable = failed.some((row) => row.rejected === "stale_snapshot")
  const budgetLimited = rows.some((row) => row.notes.some((note) => note.includes(": skipped, credit pace")))
  return { status: unavailable ? "unavailable" : failed.length ? "degraded" : budgetLimited ? "budget_limited" : "ok", httpStatus: unavailable ? 503 : 200, failedSports: failed.length, budgetLimited } as const
}
