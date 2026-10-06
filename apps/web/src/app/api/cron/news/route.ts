import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { runNews } from "@web/lib/news"
import { scheduledNewsSlot } from "@web/lib/news-schedule"
import { claimNewsLease, releaseNewsLease } from "@web/lib/news-lease"
export const maxDuration = 300
/** UTC schedules cover both offsets; wrong local-hour/holiday invocations do nothing. */
export const GET = withPublic<unknown>(async request => {
  assertCronAuthorized(request)
  const now = new Date()
  const slot = scheduledNewsSlot(now, new URL(request.url).pathname.split("/").at(-1)?.startsWith("morning") ? "morning" : "close")
  if (!slot) return NextResponse.json({ skipped: "outside scheduled trading window" })
  const key = `news:${slot}:${now.toISOString().slice(0, 10)}`
  const token = await claimNewsLease(key, 24 * 3600, 330)
  if (!token) return NextResponse.json({ skipped: "already attempted or running" })
  try {
    const result = await runNews(now, { slot })
    console.log("[cron] news", JSON.stringify(result))
    return NextResponse.json(result, { status: result.fetched > 0 && "market" in result && result.market?.board ? 200 : 502 })
  } finally { await releaseNewsLease(key, token) }
})
