/**
 * Integration check of pregame repricing against a DISPOSABLE Postgres (migrations applied):
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:PORT/db node --experimental-strip-types scripts/reprice-integration.mts
 *
 * Real transactions, real row locks: repricing vs simultaneous pick acceptance, stale-client rejection, accepted picks
 * keeping price and total return, kickoff boundary, compare-and-set idempotency, history, and freezes. Refuses to run
 * against a non-local host.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { decideReprice, type ExchangeView } from "../src/lib/sports/reprice.ts"
import { applyReprice, confirmExchange, createSportsLeague, freezeForReason, recoverFrozenMarket, listRepriceTargets, placeSportsPick, SportsError } from "../src/lib/sports/store.ts"
import { priceTwoWay, totalReturn } from "../src/lib/sports/odds.ts"

// applyReprice honours the master switch; this script is the deliberate opt-in.
process.env.LIVE_ODDS_ENABLED = "1"

const url = process.env.DATABASE_URL ?? ""
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) throw new Error("refusing to run against a non-local database")
const sql = postgres(url, { max: 10, prepare: false })
const db = drizzle(sql, { schema })

const now = new Date()
const startsAt = new Date(now.getTime() + 60 * 60_000)
const mkUser = async (n: string) => (await db.insert(schema.users).values({ email: `${n}-${randomUUID()}@example.test`, name: n }).returning())[0]!
const [u1, u2, u3] = [await mkUser("a"), await mkUser("b"), await mkUser("c")]
const league = await createSportsLeague(db, u1.id, { name: "Reprice test", emoji: "🏈", accent: "emerald", sports: ["nba"], startingCredits: 1000, endsAt: null })
for (const u of [u2, u3]) {
  await db.insert(schema.sportsMembers).values({ leagueId: league.id, userId: u.id, credits: 1000 })
}

async function newMarket(over: { startsAt?: Date; lockAt?: Date } = {}) {
  const [event] = await db.insert(schema.sportsEvents).values({ sport: "nba", externalId: `rp-${randomUUID()}`, homeName: "Boston Celtics", awayName: "Detroit Pistons", startsAt: over.startsAt ?? startsAt }).returning()
  const [market] = await db.insert(schema.sportsMarkets).values({ eventId: event!.id, marketKey: "moneyline|", kind: "moneyline", lockAt: over.lockAt ?? over.startsAt ?? startsAt, booksUsed: 3, fairProbA: 0.55, pointA: null }).returning()
  const prices = priceTwoWay(0.55)!
  const lines = await db.insert(schema.sportsLines).values([{ marketId: market!.id, selection: "home", price: prices[0], point: null }, { marketId: market!.id, selection: "away", price: prices[1], point: null }]).returning()
  return { event: event!, market: market!, home: lines.find((l) => l.selection === "home")!, away: lines.find((l) => l.selection === "away")! }
}
const ex = (probA: number): ExchangeView => ({ probA, spread: 0.02, topSize: 1000, ageMs: 500, bookTsAgeMs: 800, source: "polymarket", other: null, gameLive: false, acceptingOrders: true, point: null })
async function decide(marketId: string, probA: number, at = now) {
  const [t] = (await listRepriceTargets(db, at)).filter((x) => x.marketId === marketId)
  assert.ok(t, "market is a reprice target")
  const d = decideReprice({ now: at, startsAt: t.startsAt, eventStatus: t.eventStatus, market: t.state, exchange: ex(probA) })
  return { t, d }
}
const pick = (userId: string, lineId: string, price: number, at = now) => placeSportsPick(db, userId, league.id, { lineId, stake: 100, expectedPrice: price, expectedPoint: null, requestId: randomUUID() }, at)
const rejects = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof SportsError ? e.message : String(e)))

// 1. Happy path: reprice moves the offered line, history appended, version bumped.
const A = await newMarket()
{
  const { t, d } = await decide(A.market.id, 0.58)
  assert.equal(d.action, "update")
  if (d.action !== "update") throw new Error()
  const r = await applyReprice(db, A.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)
  assert.equal(r.applied, true)
  const [home] = await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.id, A.home.id))
  assert.equal(home!.price, priceTwoWay(0.58)![0])
  assert.equal(home!.version, 2)
  const hist = await db.select().from(schema.sportsLineHistory).where(eq(schema.sportsLineHistory.marketId, A.market.id))
  assert.equal(hist.length, 2)
  assert.equal(hist[0]!.source, "polymarket")
  console.log("1 reprice ok:", A.home.price, "->", home!.price)

  // 2. Idempotent: the same decision again is refused by the compare-and-set (a second worker or a retry changes nothing).
  const again = await applyReprice(db, A.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)
  assert.equal(again.applied, false) // refused inside the lock (min interval, or a changed basis/version)
  assert.equal((await db.select().from(schema.sportsLineHistory).where(eq(schema.sportsLineHistory.marketId, A.market.id))).length, 2)
  console.log("2 idempotent ok")

  // 3. Stale client: the old price is refused with a clear message, the new price is accepted at the new price.
  const stale = await rejects(pick(u1.id, A.home.id, A.home.price))
  assert.match(stale ?? "", /moved to/)
  const fresh = await pick(u1.id, A.home.id, home!.price)
  assert.equal(fresh.pick.price, home!.price)
  assert.equal(fresh.pick.totalReturn, totalReturn(100, home!.price))
  console.log("3 stale refused:", stale)

  // 4. Accepted pick unchanged after a further reprice; payout stored.
  const second = await decide(A.market.id, 0.61, new Date(now.getTime() + 60_000))
  assert.equal(second.d.action, "update")
  if (second.d.action === "update") assert.equal((await applyReprice(db, A.market.id, { basis: second.t.state.fairProbA, count: second.t.state.repriceCount }, second.d, new Date(now.getTime() + 60_000))).applied, true)
  const [kept] = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.id, fresh.pick.id))
  assert.deepEqual([kept!.price, kept!.point, kept!.totalReturn, kept!.stake], [fresh.pick.price, null, totalReturn(100, home!.price), 100])
  console.log("4 accepted pick unchanged after second reprice")
}

// 5. Concurrency: many picks racing a reprice. Every accepted pick must carry a price that was current when it was taken,
//    never a price the client did not see, and the pick price equals the expectedPrice the client sent.
const B = await newMarket()
{
  const users = [u1, u2, u3]
  const { t, d } = await decide(B.market.id, 0.58)
  assert.equal(d.action, "update")
  if (d.action !== "update") throw new Error()
  const oldPrice = B.home.price
  const newPrice = d.prices[0]
  // u1,u2,u3 try the OLD price while the reprice runs. Outcomes: accepted at old (before the reprice) or refused (after); never accepted at the new price.
  const results = await Promise.all([...users.map((u) => rejects(pick(u.id, B.home.id, oldPrice))), applyReprice(db, B.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)])
  const picks = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.marketId, B.market.id))
  for (const p of picks) assert.equal(p.price, oldPrice, "a pick sent at the old price was accepted only at the old price")
  assert.equal(results.slice(0, 3).filter((r) => r === null).length, picks.length)
  const [after] = await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.id, B.home.id))
  assert.equal(after!.price, newPrice)
  // And now every old-price attempt is refused.
  assert.match((await rejects(pick(u3.id, B.home.id, oldPrice, now))) ?? "already picked|moved", /moved|already/)
  console.log(`5 concurrency ok: ${picks.length} of 3 racing picks landed at the old price, line is ${after!.price}`)
}

// 5b. Deterministic: a pick in flight (holding the shared market lock) makes the reprice wait; it never overtakes it.
const B2 = await newMarket()
{
  const { t, d } = await decide(B2.market.id, 0.58)
  if (d.action !== "update") throw new Error("expected update")
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let locked!: () => void
  const gotLock = new Promise<void>((r) => (locked = r))
  const inflight = db.transaction(async (tx) => {
    await tx.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, B2.market.id)).for("share")
    locked()
    await held
  })
  await gotLock
  let done = false
  const reprice = applyReprice(db, B2.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now).then((r) => ((done = true), r))
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(done, false, "reprice waits for the in-flight pick's shared lock")
  release()
  await inflight
  assert.equal((await reprice).applied, true)
  console.log("5b reprice waits for an in-flight pick ok")
}

// 6. Kickoff boundary: reprice refused at/after the start even with a late lock; pick also refused.
const C = await newMarket({ startsAt: new Date(now.getTime() + 5 * 60_000), lockAt: new Date(now.getTime() + 3600_000) })
{
  const early = new Date(now.getTime() + 5 * 60_000 - 1)
  const { t, d } = await decide(C.market.id, 0.58, early)
  assert.equal(d.action, "update")
  if (d.action !== "update") throw new Error()
  const atStart = new Date(now.getTime() + 5 * 60_000)
  const r = await applyReprice(db, C.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, atStart)
  assert.deepEqual([r.applied, r.reason], [false, "kickoff"])
  assert.match((await rejects(pick(u2.id, C.home.id, C.home.price, atStart))) ?? "", /closed/)
  console.log("6 kickoff boundary ok")
}

// 7. Freeze is one-way and closes the market to picks; confirm stamps exchange_ok_at.
const D = await newMarket()
{
  await confirmExchange(db, [D.market.id], now)
  assert.ok((await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, D.market.id)))[0]!.exchangeOkAt)
  assert.equal(await freezeForReason(db, D.market.id, "exchange jump"), true)
  const [m] = await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, D.market.id))
  assert.deepEqual([m!.status, m!.frozenReason], ["locked", "exchange jump"])
  assert.match((await rejects(pick(u2.id, D.home.id, D.home.price))) ?? "", /closed/)
  const r = await applyReprice(db, D.market.id, { basis: 0.55, count: 0 }, { action: "update", prices: [-130, 110], fairProbA: 0.58, source: "polymarket", spread: 0.02, ageMs: 100, step: 0.03 }, now)
  assert.deepEqual([r.applied, r.reason], [false, "closed"])
  console.log("7 freeze one-way ok")
}

// 8. In-lock re-checks: stale version, min interval, and non-moneyline are refused even if the caller decided otherwise.
const E = await newMarket()
{
  const { t, d } = await decide(E.market.id, 0.58)
  if (d.action !== "update") throw new Error("expected update")
  assert.equal((await applyReprice(db, E.market.id, { basis: t.state.fairProbA, count: 99 }, d, now)).reason, "basis changed") // wrong version
  assert.equal((await applyReprice(db, E.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)).applied, true)
  const d2 = { ...d, fairProbA: 0.6, prices: priceTwoWay(0.6)! }
  assert.equal((await applyReprice(db, E.market.id, { basis: 0.58, count: 1 }, d2, new Date(now.getTime() + 5_000))).reason, "min interval")
  await db.update(schema.sportsMarkets).set({ kind: "spread" }).where(eq(schema.sportsMarkets.id, E.market.id))
  assert.equal((await applyReprice(db, E.market.id, { basis: 0.58, count: 1 }, d2, new Date(now.getTime() + 60_000))).reason, "not a moneyline")
  console.log("8 in-lock re-checks ok")
}

// 9. Stale clock: a pick queued behind an exclusive lock across kickoff is judged at the instant it can run, on the DB clock.
const F = await newMarket({ startsAt: new Date(Date.now() + 2_000), lockAt: new Date(Date.now() + 3600_000) })
{
  let release!: () => void
  const held = new Promise<void>((r) => (release = r))
  let locked!: () => void
  const gotLock = new Promise<void>((r) => (locked = r))
  const holder = db.transaction(async (tx) => {
    await tx.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, F.market.id)).for("update")
    locked()
    await held
  })
  await gotLock
  // No pinned clock: this is how the route calls it. The request arrives BEFORE kickoff and is queued behind the lock.
  const queued = placeSportsPick(db, u2.id, league.id, { lineId: F.home.id, stake: 100, expectedPrice: F.home.price, expectedPoint: null, requestId: randomUUID() })
  await new Promise((r) => setTimeout(r, 3_000)) // kickoff passes while it waits
  release()
  await holder
  const msg = await rejects(queued)
  assert.match(msg ?? "", /closed/, "a pick that waited past kickoff is refused")
  assert.equal((await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.marketId, F.market.id))).length, 0)
  console.log("9 stale clock ok: queued pick refused after kickoff")
}

// 10. Temporary freezes recover with the new price in one transaction. Accepted picks retain their copies.
for (const reason of ["line moved", "price not confirmed while the guard feed was unavailable", "live odds worker not running"]) {
  const M = await newMarket()
  await pick(u1.id, M.home.id, M.home.price)
  await freezeForReason(db, M.market.id, reason)
  const [t] = (await listRepriceTargets(db, now)).filter(t => t.marketId === M.market.id)
  assert.ok(t, "temporary frozen market is a recovery target")
  const d = decideReprice({ now, startsAt, eventStatus: "scheduled", market: { ...t.state, status: "open" }, exchange: ex(0.58) })
  assert.equal(d.action, "update")
  const r = await recoverFrozenMarket(db, M.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)
  assert.equal(r.applied, true)
  const [market] = await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, M.market.id))
  const [line] = await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.id, M.home.id))
  const [accepted] = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.marketId, M.market.id))
  assert.equal(market!.status, "open")
  assert.equal(market!.frozenReason, null)
  assert.equal(line!.price, priceTwoWay(0.58)![0])
  assert.equal(accepted!.price, M.home.price)
  assert.equal((await recoverFrozenMarket(db, M.market.id, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)).applied, false)
}
console.log("10 atomic recovery and accepted prices ok")
// 11. Other freeze reasons and non-confirming decisions cannot reopen a market.
const recoveryRefusal = await newMarket()
await freezeForReason(db, recoveryRefusal.market.id, "manual review")
assert.equal((await listRepriceTargets(db, now)).some(t => t.marketId === recoveryRefusal.market.id), false)
const expected = { basis: 0.55, count: 0 }
assert.equal((await recoverFrozenMarket(db, recoveryRefusal.market.id, expected, { action: "none", reason: "healthy", confirm: true }, now)).applied, false)
await db.update(schema.sportsMarkets).set({ frozenReason: "line moved" }).where(eq(schema.sportsMarkets.id, recoveryRefusal.market.id))
assert.equal((await recoverFrozenMarket(db, recoveryRefusal.market.id, expected, { action: "none", reason: "thin" }, now)).applied, false)
assert.equal((await recoverFrozenMarket(db, recoveryRefusal.market.id, { basis: 0.6, count: 0 }, { action: "none", reason: "healthy", confirm: true }, now)).reason, "basis changed")
assert.equal((await recoverFrozenMarket(db, recoveryRefusal.market.id, expected, { action: "none", reason: "healthy", confirm: true }, now)).applied, true)
console.log("11 recovery refusal and confirmation ok")

// 12. Recovery waits for the market lock and never exposes an open market with the old price.
const R = await newMarket()
await freezeForReason(db, R.market.id, "line moved")
const recoveryDecision = decideReprice({ now, startsAt, eventStatus: "scheduled", market: { kind: "moneyline", status: "open", lockAt: startsAt, createdAt: now, fairProbA: 0.55, pointA: null, prices: priceTwoWay(0.55)!, repricedAt: null, repriceCount: 0, exchangeOkAt: now, history: [] }, exchange: ex(0.58) })
let unlockRecovery!: () => void
let recoveryLocked!: () => void
const recoveryHeld = new Promise<void>(r => { unlockRecovery = r })
const recoveryGotLock = new Promise<void>(r => { recoveryLocked = r })
const recoveryHolder = db.transaction(async tx => {
  await tx.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, R.market.id)).for("share")
  recoveryLocked()
  await recoveryHeld
})
await recoveryGotLock
let recovered = false
const pendingRecovery = recoverFrozenMarket(db, R.market.id, { basis: 0.55, count: 0 }, recoveryDecision, new Date()).then(r => { recovered = true; return r })
await new Promise(r => setTimeout(r, 200))
assert.equal(recovered, false)
assert.equal((await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, R.market.id)))[0]!.status, "locked")
unlockRecovery()
await recoveryHolder
assert.equal((await pendingRecovery).applied, true)
assert.match((await rejects(pick(u2.id, R.home.id, R.home.price))) ?? "", /moved/)
console.log("12 atomic recovery lock and stale-pick rejection ok")

await sql.end()
console.log("reprice integration: PASS")
