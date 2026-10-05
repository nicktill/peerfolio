import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { fillQueuedOrders } from "@web/lib/fantasy"
import { refreshLivePrices } from "@web/lib/live-quotes"
import { refreshSecurityMetadata, refreshStalePrices } from "@web/lib/positions"

export const maxDuration = 60

/**
 * Keeps prices moving without anyone having to open the app. A scheduler (the
 * GitHub Actions workflow in .github/workflows/prices.yml) calls this every
 * 15 minutes; it does the same two things a page load does:
 *
 *  - live quotes for tickers whose price is older than the refresh period
 *    (market hours only, within the per-minute call budget), and
 *  - the official-close catch-up, so a finished session's close lands the
 *    evening it is published, and
 *  - fills fantasy orders queued while the market was closed, so they go
 *    through soon after the open even if nobody has the league open.
 *
 * It answers 500 when it tried to refresh and nothing arrived, so a broken key
 * or provider shows up as a failed run instead of silently stale prices.
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)

  const live = await refreshLivePrices().catch((error) => ({ error: error instanceof Error ? error.message : "unknown" }))
  // No per-instance throttle here: the schedule is the throttle.
  const closes = await refreshStalePrices({ minIntervalMinutes: 0, recheckMinutes: 10 })

  const metadata = await refreshSecurityMetadata().catch(() => ({ checked: 0 }))
  const orders = await fillQueuedOrders().catch((error) => ({ error: error instanceof Error ? error.message : "unknown" }))

  const liveBroken = "error" in live || ("claimed" in live && (live.claimed ?? 0) > 0 && live.refreshed === 0)
  console.log("[cron] prices", JSON.stringify({ live, closes, metadata, orders }))
  return NextResponse.json({ healthy: !liveBroken, live, closes, metadata, orders }, { status: liveBroken ? 500 : 200 })
})
