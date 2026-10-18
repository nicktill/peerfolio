import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@web/db"
import { withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { sportsMode } from "@web/lib/sports/flag"
import { staleness, stuckPickRows, tally, type StuckPick } from "@web/lib/sports/health-report"

export const dynamic = "force-dynamic"

/** One section failing (for example a column a pending migration has not added yet) must not blank the whole page. */
async function safe<T>(name: string, fn: () => Promise<T>, errors: Record<string, string>): Promise<T | null> {
  try {
    return await fn()
  } catch (error) {
    errors[name] = error instanceof Error ? error.message.slice(0, 200) : "failed"
    return null
  }
}

const rowsOf = async <T extends Record<string, unknown>>(query: ReturnType<typeof sql>) => [...(await db.execute<T>(query))]

/** Sports pipeline health for admins: job freshness, game and pick backlogs, live attempts and provider credits. All queries are bounded. */
export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  const now = new Date()
  const errors: Record<string, string> = {}

  const workers = await safe("workers", () => rowsOf<{ name: string; last_cycle_at: Date; last_ok_at: Date | null; consecutive_failures: number; details: Record<string, unknown> }>(sql`SELECT name, last_cycle_at, last_ok_at, consecutive_failures, details FROM live_worker LIMIT 20`), errors)
  const worker = (name: string) => workers?.find((w) => w.name === name) ?? null
  const jobs = (["publish", "settle", "worker"] as const).map((job) => {
    const row = worker(job === "worker" ? "live-odds" : `sports-${job}`)
    const last = row?.last_cycle_at ?? null
    return {
      job,
      lastAt: last ? new Date(last).toISOString() : null,
      lastOkAt: row?.last_ok_at ? new Date(row.last_ok_at).toISOString() : null,
      failures: row?.consecutive_failures ?? 0,
      details: row?.details ?? null,
      ...staleness(job, last, now),
    }
  })

  const events = await safe("events", () => rowsOf<{ status: string; n: number; final_seen: number; past: number }>(sql`
    SELECT status, count(*)::int AS n, count(final_first_seen_at)::int AS final_seen,
           count(*) FILTER (WHERE starts_at < now() - interval '6 hours')::int AS past
    FROM sports_events WHERE starts_at > now() - interval '14 days' GROUP BY status`), errors)

  const stuck = await safe("stuck", async () => {
    const rows = await rowsOf<{ pick_id: string; accepted_at: Date; status: string; final_first_seen_at: Date | null }>(sql`
      SELECT p.id AS pick_id, p.accepted_at, e.status, e.final_first_seen_at
      FROM sports_picks p
      JOIN sports_markets m ON m.id = p.market_id
      JOIN sports_events e ON e.id = m.event_id
      WHERE p.status = 'open' AND (e.status IN ('final', 'void', 'cancelled', 'postponed') OR e.final_first_seen_at IS NOT NULL)
      ORDER BY p.accepted_at LIMIT 50`)
    const input: StuckPick[] = rows.map((r) => ({ pickId: r.pick_id, acceptedAt: r.accepted_at, eventStatus: r.status, finalFirstSeenAt: r.final_first_seen_at }))
    return stuckPickRows(input, now).map((r) => ({ pickId: r.pickId.slice(0, 8), acceptedAt: new Date(r.acceptedAt).toISOString(), eventStatus: r.eventStatus, ageMs: r.ageMs, sinceFinalMs: r.sinceFinalMs, level: r.level }))
  }, errors)

  const picks = await safe("picks", () => rowsOf<{ status: string; n: number }>(sql`SELECT status, count(*)::int AS n FROM sports_picks GROUP BY status`), errors)
  const parlays = await safe("parlays", () => rowsOf<{ status: string; n: number; last_at: Date | null }>(sql`SELECT status, count(*)::int AS n, max(accepted_at) AS last_at FROM sports_parlays GROUP BY status`), errors)

  const liveTests = await safe("liveTests", async () => {
    const rows = await rowsOf<{ requested_at: Date; outcome: string; reason: string | null; quote_age_ms: number | null; state_age_ms: number | null; offered_price: number }>(sql`
      SELECT requested_at, outcome, reason, quote_age_ms, state_age_ms, offered_price FROM sports_live_tests ORDER BY requested_at DESC LIMIT 25`)
    return {
      recent: rows.map((r) => ({ requestedAt: new Date(r.requested_at).toISOString(), outcome: r.outcome, reason: r.reason, quoteAgeMs: r.quote_age_ms, stateAgeMs: r.state_age_ms, price: r.offered_price })),
      byReason: tally(rows.map((r) => (r.outcome === "accepted" || r.outcome === "paper" ? r.outcome : `${r.outcome}: ${r.reason ?? "unknown"}`))).slice(0, 8),
    }
  }, errors)

  const usage = await safe("usage", () => rowsOf<{ provider: string; day: string; credits: number }>(sql`SELECT provider, day::text AS day, credits FROM sports_provider_usage WHERE day >= current_date - 6 ORDER BY day DESC, provider LIMIT 60`), errors)

  const notifications = await safe("notifications", () => rowsOf<{ kind: string; n: number; pending: number }>(sql`
    SELECT kind, count(*)::int AS n, count(*) FILTER (WHERE delivered_at IS NULL)::int AS pending
    FROM sports_notifications WHERE created_at > now() - interval '7 days' GROUP BY kind`), errors)

  const publish = worker("sports-publish")
  const hidden = (publish?.details?.hidden as { sport: string; detail: string }[] | undefined) ?? []

  return NextResponse.json({
    now: now.toISOString(),
    mode: sportsMode(),
    jobs,
    events: events ?? [],
    stuckPicks: stuck ?? [],
    picks: picks ?? [],
    parlays: parlays === null ? null : parlays.map((r) => ({ status: r.status, n: r.n, lastAt: r.last_at ? new Date(r.last_at).toISOString() : null })),
    liveTests,
    usage: usage ?? [],
    notifications: notifications ?? [],
    hidden,
    errors,
  })
})
