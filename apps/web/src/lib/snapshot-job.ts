import "server-only"
import { and, eq, sql } from "drizzle-orm"
import { db, snapshotSteps, fantasyMembers } from "@web/db"
import { listSyncableUserIds, syncUser } from "@web/lib/plaid-sync"
import { refreshStalePrices, repricePositions } from "@web/lib/positions"
import { checkFantasyIntegrity, snapshotFantasy } from "@web/lib/fantasy"
import { withProviderPatience } from "@web/lib/provider-fetch"

/** Persisted steps survive a function timeout; only an expired lease can be
 * retried concurrently. Successful user/date steps are never replayed. */
export async function runSnapshotJob({ resumeOnly = false, deadline = Date.now() + 250_000 } = {}) {
  const date = new Date().toISOString().slice(0, 10)
  const known = await db.select().from(snapshotSteps).where(eq(snapshotSteps.date, date))
  if (resumeOnly && !known.length) {
    const [overdue] = await db.execute<{ date: string }>(sql`
      select date::text as date from snapshot_steps s
      where step = 'started' and date < ${date}::date and date >= ${date}::date - 1
        and not exists (select 1 from snapshot_steps done where done.date = s.date and done.step = 'done' and done.status = 'complete')
      order by date desc limit 1
    `)
    // Never manufacture yesterday's value from today's balances.
    return overdue ? { healthy: false, overdue: overdue.date } : { healthy: true, skipped: true }
  }
  if (resumeOnly && known.some(s => s.step === "done" && s.status === "complete")) return { healthy: true, skipped: true }
  await db.insert(snapshotSteps).values({ date, step: "started", status: "complete" }).onConflictDoNothing()
  const outcomes: Record<string, unknown> = {}
  const failures: string[] = []
  async function step(name: string, work: () => Promise<boolean>) {
    if (Date.now() > deadline - 30_000) return
    const claimed = await db.execute(sql`
      INSERT INTO snapshot_steps (date, step, status, updated_at) VALUES (${date}::date, ${name}, 'running', now())
      ON CONFLICT (date, step) DO UPDATE SET status = 'running', updated_at = now()
      WHERE snapshot_steps.status = 'failed' OR (snapshot_steps.status = 'running' AND snapshot_steps.updated_at < now() - interval '5 minutes')
      RETURNING step
    `)
    if (!claimed.length) return
    let healthy = false
    try { healthy = await work() } catch (error) { outcomes[name] = { error: error instanceof Error ? error.message : "unknown" } }
    if (!healthy) failures.push(name)
    await db.update(snapshotSteps).set({ status: healthy ? "complete" : "failed", updatedAt: new Date() })
      .where(and(eq(snapshotSteps.date, date), eq(snapshotSteps.step, name)))
  }
  await step("pricing", async () => {
    const pricing = await withProviderPatience(Math.min(120_000, Math.max(0, deadline - Date.now() - 60_000)), async () => {
      const prices = await repricePositions()
      return { ...prices, ...await refreshStalePrices({ minIntervalMinutes: 0, recheckMinutes: 0, wholeMarket: false }) }
    })
    outcomes.pricing = pricing
    return !pricing.failed && !pricing.deferred && (pricing.unconfirmed ?? 0) === 0 && !(pricing.tickers > 0 && pricing.priced === 0)
  })
  const pricingState = await db.query.snapshotSteps.findFirst({ where: and(eq(snapshotSteps.date, date), eq(snapshotSteps.step, "pricing")) })
  const priced = pricingState?.status === "complete"
  const users = await listSyncableUserIds()
  // Unattempted users get their turn before a repeatedly failing institution.
  const failed = new Set(known.filter(s => s.status === "failed").map(s => s.step))
  users.sort((a,b) => Number(failed.has(`user:${a}`)) - Number(failed.has(`user:${b}`)))
  for (const id of users) await step(`user:${id}`, async () => {
    const result = await syncUser(id, undefined, deadline)
    outcomes[`user:${id}`] = { healthy: result.healthy, failures: result.results.filter(r => r.status !== "active"), flowFailures: result.flowFailures }
    return result.healthy && priced
  })
  if (priced) await step("fantasy", async () => { outcomes.fantasy = await snapshotFantasy(); return true })
  const members = await db.select({ id: fantasyMembers.id }).from(fantasyMembers).orderBy(fantasyMembers.id)
  const integritySteps: string[] = []
  for (let offset = 0; offset < members.length; offset += 25) {
    const ids = members.slice(offset, offset + 25).map(m => m.id)
    // Use stable member IDs, not offsets: new joins cannot shift a completed batch.
    const name = `integrity:${ids.join(",")}`
    integritySteps.push(name)
    await step(name, async () => {
      const report = await checkFantasyIntegrity(new Date(), ids)
      outcomes[name] = report
      return !report.mismatches.length && !report.badPrices.length
    })
  }
  const states = await db.select().from(snapshotSteps).where(eq(snapshotSteps.date, date))
  const complete = new Set(states.filter(s => s.status === "complete").map(s => s.step))
  const pending = ["pricing", ...users.map(id => `user:${id}`), "fantasy", ...integritySteps].filter(s => !complete.has(s))
  if (!pending.length) await db.insert(snapshotSteps).values({ date, step: "done", status: "complete" }).onConflictDoNothing()
  // Keep free-tier storage bounded. Do not prune pending current-date work.
  await db.execute(sql`delete from snapshot_steps where date < ${date}::date - 30`)
  if (!pending.length) await db.execute(sql`delete from import_ai_spend where created_at < date_trunc('month', now()) - interval '2 months'`)
  console.log("[cron] snapshot", JSON.stringify({ date, pending, failures, outcomes }))
  return { healthy: !pending.length, date, pending, failures, outcomes }
}
