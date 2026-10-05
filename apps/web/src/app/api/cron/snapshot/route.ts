import { NextResponse } from "next/server"
import { listSyncableUserIds, syncUser } from "@web/lib/plaid-sync"
import { assertCronAuthorized, withPublic } from "@web/lib/api"
import { refreshStalePrices, repricePositions, type CatchUpResult } from "@web/lib/positions"
import { checkFantasyIntegrity, snapshotFantasy } from "@web/lib/fantasy"

export const maxDuration = 300

/**
 * Nightly job: reprice manual positions, refresh every connected user, and
 * append one snapshot each.
 *
 * This is what makes performance history exist at all, so a partial failure
 * must not abort the run — one broken institution would otherwise cost every
 * later user their data point for the day, permanently.
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)

  // Prices first, so tonight's snapshots carry the latest closes. If the market
  // data call fails, snapshots still go out at yesterday's prices: a flat day
  // is recoverable, a missing one isn't.
  let pricing: (Awaited<ReturnType<typeof repricePositions>> & Partial<CatchUpResult>) | { error: string }
  try {
    pricing = await repricePositions()
    // The whole-market bars trail the session by a day on our plan, so a live price
    // from this afternoon would otherwise go into tonight's snapshot as the close.
    // repricePositions has just fetched those bars; the catch-up doesn't ask again.
    const closes = await refreshStalePrices({ minIntervalMinutes: 0, recheckMinutes: 0, wholeMarket: false })
    pricing = { ...pricing, ...closes }
  } catch (error) {
    console.error("[cron] repricing failed", error)
    pricing = { error: error instanceof Error ? error.message : "unknown" }
  }

  const userIds = await listSyncableUserIds()
  let succeeded = 0
  const failures: { userId: string; error: string }[] = []

  for (const userId of userIds) {
    try {
      await syncUser(userId)
      succeeded++
    } catch (error) {
      failures.push({ userId, error: error instanceof Error ? error.message : "unknown" })
    }
  }

  // Fantasy values come from the same closes, so they go after repricing too.
  let fantasy: Awaited<ReturnType<typeof snapshotFantasy>> | { error: string }
  try {
    fantasy = await snapshotFantasy()
  } catch (error) {
    console.error("[cron] fantasy snapshot failed", error)
    fantasy = { error: error instanceof Error ? error.message : "unknown" }
  }

  // After pricing and snapshots: prove the numbers behind the standings are
  // right, so we hear about an error before a player does.
  let integrity: Awaited<ReturnType<typeof checkFantasyIntegrity>> | { error: string }
  try {
    integrity = await checkFantasyIntegrity()
  } catch (error) {
    console.error("[cron] integrity check failed", error)
    integrity = { error: error instanceof Error ? error.message : "unknown" }
  }
  const integrityBroken = "error" in integrity || integrity.mismatches.length > 0 || integrity.badPrices.length > 0
  if (integrityBroken) console.error("[cron] fantasy integrity problems", JSON.stringify(integrity))

  console.log(`[cron] snapshot complete: ${succeeded}/${userIds.length} users`, JSON.stringify({ pricing, fantasy }))

  // Everything above is best-effort so one failure can't cost the others their
  // data point, but the run must not *look* healthy: a 200 here is what let
  // stale prices go unnoticed. Vercel marks non-2xx cron runs as failed.
  // A live price still standing in for today's close is broken too: tonight's snapshot
  // records it as the day's value.
  const pricingBroken =
    "error" in pricing || (pricing.tickers > 0 && pricing.priced === 0) || !!pricing.failed || (pricing.unconfirmed ?? 0) > 0
  const healthy = !pricingBroken && !("error" in fantasy) && !integrityBroken && failures.length === 0
  return NextResponse.json({ healthy, pricing, fantasy, integrity, users: userIds.length, succeeded, failures }, { status: healthy ? 200 : 500 })
})
