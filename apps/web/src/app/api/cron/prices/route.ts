import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { withProviderPatience } from "@web/lib/provider-fetch"
import { fillQueuedOrders } from "@web/lib/fantasy"
import { cronWindow } from "@web/lib/cron-window"
import { refreshLivePrices } from "@web/lib/live-quotes"
import { liveRefreshBroken } from "@web/lib/stale-prices"
import { db } from "@web/db"
import { writeHeartbeat } from "@web/lib/sports/live/store"
import { refreshSecurityMetadata, refreshStalePrices } from "@web/lib/positions"

export const maxDuration = 60

/**
 * Keeps prices moving without anyone having to open the app. A scheduler (the
 * GitHub Actions workflow in .github/workflows/prices.yml) calls this every
 * 15 minutes in market hours, then only at the close-capture attempts (lib/cron-window.ts); it does the same two things a page load does:
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
  // Before anything touches the database or a provider: outside the windows with work to do, answer at once.
  const window = cronWindow(new Date())
  if (!window.any) return NextResponse.json({ healthy: true, skipped: "outside_window" })
  // A scheduled run may wait a little for provider budget (within maxDuration) rather than defer work.
  return withProviderPatience(20_000, () => refresh(window))
})

async function refresh(window: ReturnType<typeof cronWindow>) {
  // Live quotes and queued fantasy orders only matter while the market is open; refreshLivePrices
  // itself also checks, so this only saves the call.
  const live = window.live
    ? await refreshLivePrices().catch((error) => ({ error: error instanceof Error ? error.message : "unknown" }))
    : { skipped: "market_closed" as const }
  // No per-instance throttle here: the schedule is the throttle.
  const closes = await refreshStalePrices({ minIntervalMinutes: 0, recheckMinutes: 10 })

  // Record when official closes actually land (one small row per attempt that saved any), so the attempt ladder in
  // lib/cron-window.ts can be tuned from real data. Reuses the heartbeat table; never allowed to fail the run.
  if (closes.refreshed > 0) {
    const at = new Date()
    await writeHeartbeat(db, { name: `close-capture:${at.toISOString().slice(0, 16)}`, at, ok: true, consecutiveFailures: 0, details: { refreshed: closes.refreshed, awaitingClose: closes.awaitingClose ?? null } }).catch(() => undefined)
  }

  // (Pruning moved to the daily snapshot cron.)
  const metadata = await refreshSecurityMetadata().catch(() => ({ checked: 0 }))
  const orders = window.live ? await fillQueuedOrders().catch((error) => ({ error: error instanceof Error ? error.message : "unknown" })) : { skipped: "market_closed" as const }

  const liveBroken = liveRefreshBroken(live)
  console.log("[cron] prices", JSON.stringify({ live, closes, metadata, orders }))
  return NextResponse.json({ healthy: !liveBroken, live, closes, metadata, orders }, { status: liveBroken ? 500 : 200 })
}
