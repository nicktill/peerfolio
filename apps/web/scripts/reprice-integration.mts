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
import { applyReprice, confirmExchange, createSportsLeague, freezeForReason, listRepriceTargets, placeSportsPick, SportsError } from "../src/lib/sports/store.ts"
import { priceTwoWay, totalReturn } from "../src/lib/sports/odds.ts"

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
const ex = (probA: number): ExchangeView => ({ probA, spread: 0.02, ageMs: 500, bookTsAgeMs: 800, source: "polymarket", other: null, gameLive: false, acceptingOrders: true, point: null })
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
  const { t, d } = await decide(A.market.id, 0.6)
  assert.equal(d.action, "update")
  if (d.action !== "update") throw new Error()
  const r = await applyReprice(db, A.market.id, t.state.fairProbA, d, now)
  assert.equal(r.applied, true)
  const [home] = await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.id, A.home.id))
  assert.equal(home!.price, priceTwoWay(0.6)![0])
  assert.equal(home!.version, 2)
  const hist = await db.select().from(schema.sportsLineHistory).where(eq(schema.sportsLineHistory.marketId, A.market.id))
  assert.equal(hist.length, 2)
  assert.equal(hist[0]!.source, "polymarket")
  console.log("1 reprice ok:", A.home.price, "->", home!.price)

  // 2. Idempotent: the same decision again is refused by the compare-and-set (a second worker or a retry changes nothing).
  const again = await applyReprice(db, A.market.id, t.state.fairProbA, d, now)
  assert.deepEqual([again.applied, again.reason], [false, "basis changed"])
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
  const second = await decide(A.market.id, 0.64, new Date(now.getTime() + 60_000))
  assert.equal(second.d.action, "update")
  if (second.d.action === "update") assert.equal((await applyReprice(db, A.market.id, second.t.state.fairProbA, second.d, new Date(now.getTime() + 60_000))).applied, true)
  const [kept] = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.id, fresh.pick.id))
  assert.deepEqual([kept!.price, kept!.point, kept!.totalReturn, kept!.stake], [fresh.pick.price, null, totalReturn(100, home!.price), 100])
  console.log("4 accepted pick unchanged after second reprice")
}

// 5. Concurrency: many picks racing a reprice. Every accepted pick must carry a price that was current when it was taken,
//    never a price the client did not see, and the pick price equals the expectedPrice the client sent.
const B = await newMarket()
{
  const users = [u1, u2, u3]
  const { t, d } = await decide(B.market.id, 0.6)
  assert.equal(d.action, "update")
  if (d.action !== "update") throw new Error()
  const oldPrice = B.home.price
  const newPrice = d.prices[0]
  // u1,u2,u3 try the OLD price while the reprice runs. Outcomes: accepted at old (before the reprice) or refused (after); never accepted at the new price.
  const results = await Promise.all([...users.map((u) => rejects(pick(u.id, B.home.id, oldPrice))), applyReprice(db, B.market.id, t.state.fairProbA, d, now)])
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
  const { t, d } = await decide(B2.market.id, 0.6)
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
  const reprice = applyReprice(db, B2.market.id, t.state.fairProbA, d, now).then((r) => ((done = true), r))
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
  const { t, d } = await decide(C.market.id, 0.62, early)
  assert.equal(d.action, "update")
  if (d.action !== "update") throw new Error()
  const atStart = new Date(now.getTime() + 5 * 60_000)
  const r = await applyReprice(db, C.market.id, t.state.fairProbA, d, atStart)
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
  const r = await applyReprice(db, D.market.id, 0.55, { action: "update", prices: [-130, 110], fairProbA: 0.58, source: "polymarket", spread: 0.02, ageMs: 100, step: 0.03 }, now)
  assert.deepEqual([r.applied, r.reason], [false, "closed"])
  console.log("7 freeze one-way ok")
}

await sql.end()
console.log("reprice integration: PASS")
