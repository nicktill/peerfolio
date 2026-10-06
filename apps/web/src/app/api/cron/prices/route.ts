import { priceJobHealthy } from "@web/lib/job-health"
import { runSnapshotJob } from "@web/lib/snapshot-job"
import { retryPlaidRemovals } from "@web/lib/plaid-removal"
import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { withProviderPatience } from "@web/lib/provider-fetch"
import { fillQueuedOrders } from "@web/lib/fantasy"
import { refreshLivePrices } from "@web/lib/live-quotes"
import { refreshSecurityMetadata, refreshStalePrices } from "@web/lib/positions"

export const maxDuration = 300

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
  // A scheduled run may wait a little for provider budget (within maxDuration) rather than defer work.
  return withProviderPatience(20_000, refresh)
})

async function refresh() {
  const deadline = Date.now() + 250_000
  const live = await refreshLivePrices().catch((error) => ({ error: error instanceof Error ? error.message : "unknown" }))
  // No per-instance throttle here: the schedule is the throttle.
  const closes = await refreshStalePrices({ minIntervalMinutes: 0, recheckMinutes: 10 })

  const metadata = await refreshSecurityMetadata().catch(error => ({ error: error instanceof Error ? error.message : "unknown" }))
  const orders = await fillQueuedOrders().catch((error) => ({ error: error instanceof Error ? error.message : "unknown" }))

  const snapshot = await runSnapshotJob({ resumeOnly: true, deadline }).catch(error => ({ healthy: false, error: error instanceof Error ? error.message : "unknown" }))
  const removals = Date.now() < deadline ? await retryPlaidRemovals(1) : { deferred: true }
  const healthy = priceJobHealthy(live, closes, metadata, orders) && snapshot.healthy
  console.log("[cron] prices", JSON.stringify({ healthy, live, closes, metadata, orders, snapshot, removals }))
  return NextResponse.json({ healthy, live, closes, metadata, orders, snapshot, removals }, { status: healthy ? 200 : 500 })
}
