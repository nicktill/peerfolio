import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { runNewsOnce } from "@web/lib/news"

export const maxDuration = 300

/**
 * The news job: stores headlines from publishers' RSS feeds and writes whatever
 * briefing is due (7am, 10:15am, noon, 2:15pm and close + 20 minutes ET).
 * Publication is idempotent within a slot; page visits catch up missed slots.
 * GitHub schedules cover EDT/EST, with Vercel as an evening backup.
 * `?force=1` rewrites today's recaps (for checking a prompt change).
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)
  const force = new URL(request.url).searchParams.get("force") === "1"
  const result = await runNewsOnce(new Date(), { force })
  if (!result) return NextResponse.json({ skipped: "already running" })
  console.log("[cron] news", JSON.stringify(result))
  // Healthy only if headlines arrived; an empty run means every feed failed.
  return NextResponse.json(result, { status: result.fetched > 0 ? 200 : 502 })
})
