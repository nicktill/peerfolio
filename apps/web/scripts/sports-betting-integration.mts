/**
 * Live picks and parlays against a DISPOSABLE local Postgres with every migration applied:
 *
 *   DATABASE_URL=postgres://user@127.0.0.1:PORT/db node --experimental-strip-types scripts/sports-betting-integration.mts
 *
 * Place -> settle -> payout for a live pick and for parlays (win, loss, push-dropped leg, all-void refund), replayed and
 * concurrent requests, the limits shared between singles, live picks and parlays, and the ledger/credit invariant.
 * Refuses to run against a non-local host. No network, no keys.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { and, eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { mockEvent } from "../src/lib/sports/providers/mock.ts"
import { resolveConfigForSport, DEFAULT_RESOLVE } from "../src/lib/sports/settlement.ts"
import { createSportsLeague, lockDueMarkets, placeSportsParlay, placeSportsPick, publishLines, settleDueEvents, SportsError, voidMarket } from "../src/lib/sports/store.ts"
import { logLiveAttempt, placeLivePick, setLeagueLiveBetting } from "../src/lib/sports/live-store.ts"
import type { EventRef, EventResult, OddsProvider, ProviderEvent, ResultsProvider, Sport } from "../src/lib/sports/types.ts"

const url = process.env.DATABASE_URL ?? ""
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) throw new Error("refusing to run against a non-local database")
const client = postgres(url, { max: 10, prepare: false, onnotice: () => {} })
const db = drizzle(client, { schema })
const { sportsMembers, sportsPicks, sportsParlays, sportsParlayLegs, sportsLedger, sportsMarkets, sportsEvents, sportsLines } = schema

const run = randomUUID().slice(0, 8)
const now = new Date()
const startsAt = new Date(now.getTime() + 3 * 3600_000)
const odds = (events: ProviderEvent[]): OddsProvider => ({ name: "fixture", fetchOdds: async (sport: Sport, at: Date) => ({ provider: "fixture", fetchedAt: at, events: events.filter((e) => e.sport === sport) }) })
const ev = (n: number): ProviderEvent => { const base = mockEvent("nfl", n, startsAt); return { ...base, externalId: `bt-${run}-${n}`, homeName: `${base.homeName} ${run}${n}`, awayName: `${base.awayName} ${run}${n}` } }
const E = [1, 2, 3, 4, 5, 6, 7, 8].map(ev)
const mkUser = async (n: string) => (await db.insert(schema.users).values({ email: `${n}-${randomUUID()}@example.test`, name: n }).returning())[0]!
const U = [await mkUser("a"), await mkUser("b"), await mkUser("c"), await mkUser("d"), await mkUser("e")]
const league = await createSportsLeague(db, U[0]!.id, { name: `Betting IT ${run}`, emoji: "x", accent: "emerald", sports: ["nfl"], startingCredits: 1000, endsAt: null })
for (const u of U.slice(1)) await db.insert(sportsMembers).values({ leagueId: league.id, userId: u.id, credits: 1000 }).then(async () => {
  const [m] = await db.select().from(sportsMembers).where(and(eq(sportsMembers.userId, u.id), eq(sportsMembers.leagueId, league.id)))
  await db.insert(sportsLedger).values({ memberId: m!.id, type: "grant", amount: 1000, idempotencyKey: `grant:${m!.id}` })
})
const published = await publishLines(db, odds(E), ["nfl"], now)
assert.ok(published[0]!.published > 0, `published ${JSON.stringify(published)}`)

const memberOf = async (u: { id: string }) => (await db.select().from(sportsMembers).where(and(eq(sportsMembers.userId, u.id), eq(sportsMembers.leagueId, league.id))))[0]!
const cash = async (u: { id: string }) => (await memberOf(u)).credits
const ev1 = async (e: ProviderEvent) => (await db.select().from(sportsEvents).where(eq(sportsEvents.externalId, e.externalId)))[0]!
const market = async (e: ProviderEvent, key = "moneyline|") => {
  const event = await ev1(e)
  const m = (await db.select().from(sportsMarkets).where(eq(sportsMarkets.eventId, event.id))).find((x) => x.marketKey === key)
  assert.ok(m, `${key} market for ${e.externalId}`)
  const lines = await db.select().from(sportsLines).where(eq(sportsLines.marketId, m.id))
  return { event, m, line: (sel: string) => lines.find((l) => l.selection === sel)! }
}
const leg = (l: { id: string; price: number; point: number | null }) => ({ lineId: l.id, expectedPrice: l.price, expectedPoint: l.point })
const parlay = (u: { id: string }, legs: ReturnType<typeof leg>[], stake = 20, at = now, requestId: string = randomUUID()) => placeSportsParlay(db, u.id, league.id, { stake, legs, requestId }, at)
const fails = (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof SportsError || e instanceof Error ? e.message : String(e)))
const decimal = (price: number) => (price > 0 ? 1 + price / 100 : 1 + 100 / -price)
const checkInvariant = async (label: string) => {
  const rows = await client`SELECT m.id, m.credits, coalesce((SELECT sum(amount) FROM sports_ledger l WHERE l.member_id = m.id), 0)::int AS led FROM sports_members m WHERE m.league_id = ${league.id}`
  for (const r of rows) assert.equal(r.credits, r.led, `${label}: credits equal ledger for member ${r.id}`)
}

const M = await Promise.all(E.map((e) => market(e)))
const ML = (i: number, sel: "home" | "away") => M[i]!.line(sel)

// ---- A. parlay placement rules ----
await checkInvariant("start")
const pa = await parlay(U[0]!, [leg(ML(0, "home")), leg(ML(1, "home"))], 20)
assert.equal(await cash(U[0]!), 980)
assert.equal(pa.parlay.totalReturn, Math.floor(20 * decimal(ML(0, "home").price) * decimal(ML(1, "home").price) + 1e-9))
// replay: same request id returns the same parlay, one debit; concurrent replays too
const rid = randomUUID()
const reps = await Promise.all(Array.from({ length: 6 }, () => parlay(U[1]!, [leg(ML(0, "home")), leg(ML(3, "home"))], 20, now, rid)))
assert.equal(new Set(reps.map((r) => r.parlay.id)).size, 1, "concurrent replays make one parlay")
assert.equal(await cash(U[1]!), 980, "one debit for six concurrent identical requests")
// rejections
assert.match((await fails(parlay(U[2]!, [leg(ML(0, "home")), leg(M[0]!.line("away"))])))!, /Each leg|different|one leg/i, "same event / same market")
const sp0 = await market(E[0]!, "spread|")
assert.match((await fails(parlay(U[2]!, [leg(ML(0, "home")), leg(sp0.line("home"))])))!, /one leg per game/i)
assert.ok(await fails(parlay(U[2]!, [leg(ML(2, "home"))])), "one leg rejected")
assert.ok(await fails(parlay(U[2]!, [leg(ML(2, "home")), leg(ML(4, "home"))], 0)), "zero stake")
assert.ok(await fails(parlay(U[2]!, [leg(ML(2, "home")), leg(ML(4, "home"))], -20)), "negative stake")
assert.ok(await fails(parlay(U[2]!, [leg(ML(2, "home")), leg(ML(4, "home"))], 20.5)), "fractional stake")
// The cap is now configured per league, rather than a fixed 2% for every parlay.
await db.update(schema.sportsLeagues).set({ maxStakePct: 2 }).where(eq(schema.sportsLeagues.id, league.id))
assert.ok(await fails(parlay(U[2]!, [leg(ML(2, "home")), leg(ML(4, "home"))], 21)), "over the configured 2% parlay cap")
await db.update(schema.sportsLeagues).set({ maxStakePct: 10 }).where(eq(schema.sportsLeagues.id, league.id))
assert.ok(await fails(parlay(U[2]!, [leg({ ...ML(2, "home"), price: ML(2, "home").price + 5 }), leg(ML(4, "home"))])), "stale price")
const prop = (await db.select().from(sportsMarkets).where(eq(sportsMarkets.eventId, M[2]!.event.id))).find((m) => m.kind === "player_prop")
if (prop) {
  const [pl] = await db.select().from(sportsLines).where(eq(sportsLines.marketId, prop.id))
  assert.match((await fails(parlay(U[2]!, [leg(pl!), leg(ML(4, "home"))])))!, /Player props/i)
}
assert.equal(await cash(U[2]!), 1000, "rejections do not debit")
await checkInvariant("after parlay placement")

assert.match((await fails(placeSportsParlay(db, U[0]!.id, "not-a-uuid", { stake: 20, requestId: "abcdefgh", legs: [leg(ML(0, "home")), leg(ML(1, "home"))] }, now)))!, /not found/i, "malformed league id is a 404")

// ---- B. parlays that will win / lose / push / void ----
const pc = await parlay(U[2]!, [leg(ML(0, "home")), leg(ML(2, "home"))], 20)   // E3 ties -> push, drops
const pd = await parlay(U[3]!, [leg(ML(4, "home")), leg(ML(5, "home"))], 20)   // both voided -> refund
const pe = await parlay(U[4]!, [leg(ML(1, "away")), leg(ML(5, "away"))], 20)   // E2 away loses (lost leg) but E6 voided: lost
await checkInvariant("after all parlays")

// ---- C. live pick preconditions ----
const live = await ev1(E[6]!)
const liveEvent = E[6]!
const rejectsPregame = await fails(placeLivePick(db, U[0]!.id, league.id, { eventId: live.id, selection: "home", stake: 40, price: -150, requestId: randomUUID() }, now))
assert.match(rejectsPregame!, /closed|market|Picks/i, "live pick refused before kickoff")
// start the game 30 minutes ago; markets lock
const kickoff = new Date(now.getTime() - 30 * 60_000)
await db.update(sportsEvents).set({ startsAt: kickoff }).where(eq(sportsEvents.id, live.id))
await db.update(sportsMarkets).set({ lockAt: kickoff }).where(eq(sportsMarkets.eventId, live.id))
await lockDueMarkets(db, now)
const l1 = await placeLivePick(db, U[0]!.id, league.id, { eventId: live.id, selection: "home", stake: 40, price: -150, requestId: randomUUID() }, now)
assert.equal(l1.pick.stake, 40)
assert.equal(await cash(U[0]!), 940)
// replay and concurrent replay: no second debit
const lr = randomUUID()
const lres = await Promise.all(Array.from({ length: 6 }, () => placeLivePick(db, U[1]!.id, league.id, { eventId: live.id, selection: "away", stake: 40, price: 130, requestId: lr }, now)))
assert.equal(new Set(lres.map((r) => r.pick.id)).size, 1)
assert.equal(await cash(U[1]!), 940, "20 parlay + 40 live, debited once")
// cooldown, same side twice, stake bounds, wrong league sports
assert.match((await fails(placeLivePick(db, U[0]!.id, league.id, { eventId: live.id, selection: "away", stake: 40, price: 130, requestId: randomUUID() }, new Date(now.getTime() + 5_000))))!, /Wait/)
assert.match((await fails(placeLivePick(db, U[0]!.id, league.id, { eventId: live.id, selection: "home", stake: 40, price: -150, requestId: randomUUID() }, new Date(now.getTime() + 60_000))))!, /already hold/)
assert.ok(await fails(placeLivePick(db, U[2]!.id, league.id, { eventId: live.id, selection: "home", stake: 51, price: -150, requestId: randomUUID() }, now)), "over live max stake")
assert.ok(await fails(placeLivePick(db, U[2]!.id, league.id, { eventId: live.id, selection: "home", stake: -5, price: -150, requestId: randomUUID() }, now)), "negative stake")
// a non-member cannot place
const outsider = await mkUser("out")
assert.match((await fails(placeLivePick(db, outsider.id, league.id, { eventId: live.id, selection: "home", stake: 40, price: -150, requestId: randomUUID() }, now)))!, /not found/i)
// live betting off
await setLeagueLiveBetting(db, U[0]!.id, league.id, false)
assert.match((await fails(placeLivePick(db, U[2]!.id, league.id, { eventId: live.id, selection: "home", stake: 40, price: -150, requestId: randomUUID() }, now)))!, /off/i)
await setLeagueLiveBetting(db, U[0]!.id, league.id, true)
// live line cannot go in a parlay
const liveMarkets = await db.select().from(sportsMarkets).where(eq(sportsMarkets.eventId, live.id))
const liveLine = (await db.select().from(sportsLines).where(eq(sportsLines.marketId, liveMarkets.find((m) => m.marketKey === "live|1")!.id)))[0]!
assert.ok(await fails(parlay(U[2]!, [leg(liveLine), leg(ML(4, "home"))])), "live line refused in a parlay")
// the attempt log accepts our rows
await logLiveAttempt(db, { id: randomUUID(), userId: U[0]!.id, leagueId: league.id, eventId: live.id, selection: "home", stake: 40, offeredPrice: -150, requestedAt: now, acceptedAt: now, quoteAgeMs: 1, stateAgeMs: 1, outcome: "accepted", reason: null, pickId: l1.pick.id, receipt: { ok: true } })
assert.equal((await client`SELECT count(*)::int AS n FROM sports_live_tests WHERE league_id = ${league.id}`)[0]!.n, 1, "live attempt row written")
await checkInvariant("after live picks")

// ---- D. open-pick and exposure limits are shared by singles, parlays and live picks ----
const heavy = await mkUser("heavy")
await db.insert(sportsMembers).values({ leagueId: league.id, userId: heavy.id, credits: 1000 }).then(async () => {
  const hm = await memberOf(heavy)
  await db.insert(sportsLedger).values({ memberId: hm.id, type: "grant", amount: 1000, idempotencyKey: `grant:${hm.id}` })
})
for (let i = 0; i < 20; i++) await parlay(heavy, [leg(ML(2, "home")), leg(ML(4, "home"))], 20)
assert.match((await fails(parlay(heavy, [leg(ML(3, "home")), leg(ML(5, "home"))])))!, /20 open picks/, "21st open parlay refused")
assert.match((await fails(placeLivePick(db, heavy.id, league.id, { eventId: live.id, selection: "home", stake: 40, price: -150, requestId: randomUUID() }, new Date(now.getTime() + 120_000))))!, /open picks/, "a live pick counts the open parlays")
assert.match((await fails(placeSportsPick(db, heavy.id, league.id, { lineId: ML(7, "home").id, stake: 40, expectedPrice: ML(7, "home").price, expectedPoint: null, requestId: randomUUID() }, now)))!, /open picks/, "a single counts the open parlays")
assert.equal(await cash(heavy), 600)

// ---- D2. no picks or parlay legs once the game has started, even if the market lock has not run yet ----
const late = await ev1(E[7]!)
await db.update(sportsEvents).set({ startsAt: new Date(now.getTime() - 1000) }).where(eq(sportsEvents.id, late.id))
assert.match((await fails(placeSportsPick(db, U[2]!.id, league.id, { lineId: ML(7, "home").id, stake: 20, expectedPrice: ML(7, "home").price, expectedPoint: null, requestId: randomUUID() }, now)))!, /closed/i, "single after kickoff")
assert.match((await fails(parlay(U[2]!, [leg(ML(7, "home")), leg(ML(3, "away"))])))!, /closed/i, "parlay leg after kickoff")
await db.update(sportsEvents).set({ startsAt }).where(eq(sportsEvents.id, late.id))
await checkInvariant("after limits")

// ---- E. settle ----
const settleAt = new Date(now.getTime() + 24 * 3600_000)
const moved = new Map<string, Date>()
for (const e of E) {
  const ev = await ev1(e)
  if (e === liveEvent) { moved.set(e.externalId, kickoff); continue }
  const t = new Date(settleAt.getTime() - 12 * 3600_000)
  moved.set(e.externalId, t)
  await db.update(sportsEvents).set({ startsAt: t }).where(eq(sportsEvents.id, ev.id))
  await db.update(sportsMarkets).set({ lockAt: t }).where(eq(sportsMarkets.eventId, ev.id))
}
await lockDueMarkets(db, settleAt)
const res = (e: ProviderEvent, h: number, a: number): EventResult => ({ source: "espn", family: "espn", externalId: e.externalId, homeName: e.homeName, awayName: e.awayName, startsAt: moved.get(e.externalId) ?? e.startsAt, status: "final", homeScore: h, awayScore: a })
const espn = (rows: EventResult[]): ResultsProvider => ({ name: "espn", family: "espn", fetchResults: async (_s: Sport, refs: EventRef[]) => rows.filter((r) => refs.some((x) => x.externalId === r.externalId)) })
// void E5 and E6 moneylines by hand (as an admin void would)
await voidMarket(db, M[4]!.m.id, "test", settleAt)
await voidMarket(db, M[5]!.m.id, "test", settleAt)
const rows = [res(E[0]!, 24, 17), res(E[1]!, 10, 30), res(E[2]!, 20, 20), res(E[3]!, 10, 20), res(E[4]!, 1, 0), res(E[5]!, 1, 0), res(E[6]!, 31, 10), res(E[7]!, 3, 0)]
const one = (sport: Sport) => resolveConfigForSport(DEFAULT_RESOLVE, sport, 1)
await settleDueEvents(db, [espn(rows)], settleAt, one)
const later = new Date(settleAt.getTime() + 7 * 3600_000)
const out = await settleDueEvents(db, [espn(rows)], later, one)
console.log("settle", JSON.stringify(out))
// a second and third pass must not pay again
await settleDueEvents(db, [espn(rows)], new Date(later.getTime() + 3600_000), one)
await settleDueEvents(db, [espn(rows)], new Date(later.getTime() + 7200_000), one)
const pr = async (id: string) => (await db.select().from(sportsParlays).where(eq(sportsParlays.id, id)))[0]!
const legsOf = async (id: string) => (await db.select().from(sportsParlayLegs).where(eq(sportsParlayLegs.parlayId, id))).map((l) => l.status).sort()
// A: E1 home 24-17 win, E2 home 10-30 loses -> parlay A lost
assert.equal((await pr(pa.parlay.id)).status, "lost", "A lost on E2")
assert.equal(await cash(U[0]!), 1000 - 20 - 40 + l1.pick.totalReturn, "A lost; live pick won 31-10")
// B: E1 home wins, E4 home loses (10-20) -> lost
assert.equal((await pr(reps[0]!.parlay.id)).status, "lost")
// C: E1 home wins, E3 ties -> push dropped; payout = floor(20 x dec(E1 home))
const c = await pr(pc.parlay.id)
assert.equal(c.status, "won")
assert.equal(c.payout, Math.floor(20 * decimal(ML(0, "home").price) + 1e-9), "push leg dropped from payout")
assert.deepEqual(await legsOf(pc.parlay.id), ["push", "won"])
assert.equal(await cash(U[2]!), 1000 - 20 + c.payout!)
// D: both legs void -> stake refunded
assert.equal((await pr(pd.parlay.id)).status, "void")
assert.equal(await cash(U[3]!), 1000, "all-void parlay refunded exactly once")
// E: E2 away wins (30 > 10) -> leg won?? E2 away 30 wins; E6 away voided. so won with only E2 away leg
const e = await pr(pe.parlay.id)
assert.equal(e.status, "won", "one winning leg, one void: wins on the remaining leg")
assert.equal(e.payout, Math.floor(20 * decimal(ML(1, "away").price) + 1e-9))
// live picks: U[1] backed away on 31-10: lost
assert.equal(await cash(U[1]!), 1000 - 20 - 40, "parlay B and the away live pick both lost")
const livePicks = await db.select().from(sportsPicks).where(eq(sportsPicks.marketId, liveMarkets.find((m) => m.marketKey === "live|1")!.id))
assert.deepEqual(livePicks.map((p) => p.status).sort(), ["lost", "won"])
await checkInvariant("after settlement")
const stuck = await client`SELECT (SELECT count(*) FROM sports_picks WHERE league_id = ${league.id} AND status = 'open')::int AS picks, (SELECT count(*) FROM sports_parlays WHERE league_id = ${league.id} AND status = 'open')::int AS parlays`
assert.deepEqual({ ...stuck[0] }, { picks: 0, parlays: 0 }, "nothing left open")
const dup = await client`SELECT idempotency_key, count(*)::int AS n FROM sports_ledger WHERE member_id IN (SELECT id FROM sports_members WHERE league_id = ${league.id}) GROUP BY 1 HAVING count(*) > 1`
assert.equal(dup.length, 0, "ledger keys unique")
console.log("OK: live pick and parlay place -> settle -> payout verified on a real database")
await client.end()
