import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { runNews } from "@web/lib/news"

export const maxDuration = 300

/**
 * Nightly news: stores the day's headlines from publishers' RSS feeds and
 * writes the daily recap (and the weekly one after the week's last session).
 * Scheduled by Vercel Cron (vercel.json), separate from the snapshot job so a
 * slow feed or model call can't delay anyone's portfolio snapshot.
 * `?force=1` rewrites today's recaps (for checking a prompt change).
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)
  const force = new URL(request.url).searchParams.get("force") === "1"
  const result = await runNews(new Date(), { force })
  console.log("[cron] news", JSON.stringify(result))
  // Healthy only if headlines arrived; an empty run means every feed failed.
  return NextResponse.json(result, { status: result.fetched > 0 ? 200 : 502 })
})
