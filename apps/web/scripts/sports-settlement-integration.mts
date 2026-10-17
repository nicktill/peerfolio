/**
 * Publish -> pick -> settle integration against a DISPOSABLE Postgres (migrations applied):
 *
 *   DATABASE_URL=postgres://postgres@127.0.0.1:PORT/db node --experimental-strip-types scripts/sports-settlement-integration.mts
 *
 * Covers the new free-sports behaviour end to end with fixture providers (no network, no keys):
 *  - MLS three-way moneyline published with a draw line; draw/home/away picks; a 1-1 final pays the draw and loses home/away
 *  - NHL pick settling on a two-family quorum (one family alone waits; both agreeing settles)
 *  - an NFL tie pushes (refund) and an NHL tie voids (refund)
 *  - a frozen market and a locked market are not pickable
 *  - the kickoff lock refuses a pick at and after the start
 * Refuses to run against a non-local host. Events are named st-<run>-*; reruns leave earlier rows behind (picks block deleting them), so counts are lower bounds.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { mockEvent } from "../src/lib/sports/providers/mock.ts"
import { resolveConfigForSport } from "../src/lib/sports/settlement.ts"
import { DEFAULT_RESOLVE } from "../src/lib/sports/settlement.ts"
import { createSportsLeague, freezeForReason, freezeUnguardedMarkets, lockDueMarkets, placeSportsPick, publishLines, settleDueEvents, SportsError } from "../src/lib/sports/store.ts"
import type { EventRef, EventResult, OddsProvider, ProviderEvent, ResultsProvider, Sport } from "../src/lib/sports/types.ts"

const url = process.env.DATABASE_URL ?? ""
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) throw new Error("refusing to run against a non-local database")
const sql = postgres(url, { max: 5, prepare: false, onnotice: () => {} })
const db = drizzle(sql, { schema })

const run = randomUUID().slice(0, 8)
const now = new Date()
const startsAt = new Date(now.getTime() + 3 * 3600_000)

// ---- fixtures ----
const fixtureOdds = (events: ProviderEvent[]): OddsProvider => ({
  name: "fixture",
  fetchOdds: async (sport: Sport, at: Date) => ({ provider: "fixture", fetchedAt: at, events: events.filter((e) => e.sport === sport) }),
})
const ev = (sport: Sport, n: number, tag: string): ProviderEvent => ({ ...mockEvent(sport, n, startsAt), externalId: `st-${run}-${tag}` })
const mls = ev("mls", 1, "mls")
const nhl = ev("nhl", 1, "nhl")
const nhlTie = ev("nhl", 2, "nhltie")
const nfl = ev("nfl", 1, "nfl")

/** Where startedAgo moved each game's start; a results source reports the start time the game really had. */
const moved = new Map<string, Date>()
const resultsFor = (e: ProviderEvent, source: string, family: string, home: number, away: number): EventResult => ({
  source, family, externalId: e.externalId, homeName: e.homeName, awayName: e.awayName, startsAt: moved.get(e.externalId) ?? e.startsAt, status: "final", homeScore: home, awayScore: away,
})
const source = (name: string, family: string, rows: EventResult[], sports?: Sport[]): ResultsProvider => ({
  name, family, sports,
  fetchResults: async (_s: Sport, refs: EventRef[]) => rows.filter((r) => refs.some((x) => x.externalId === r.externalId)),
})
/** Production policy for a given provider set: per sport, as the settle cron resolves it. */
const policy = (families: Record<Sport, number>) => (sport: Sport) => resolveConfigForSport(DEFAULT_RESOLVE, sport, families[sport])
const oneFamily = policy({ nfl: 1, nba: 1, tennis: 1, nhl: 1, mlb: 1, cfb: 1, mls: 1 })
/** The free default with ESPN + the NHL API + MLB Stats API configured: two families for NHL/MLB, ESPN alone elsewhere. */
const twoFamilies = policy({ nfl: 1, nba: 1, tennis: 1, nhl: 2, mlb: 2, cfb: 1, mls: 1 })

const mkUser = async (n: string) => (await db.insert(schema.users).values({ email: `${n}-${randomUUID()}@example.test`, name: n }).returning())[0]!
const users = [await mkUser("a"), await mkUser("b"), await mkUser("c")] as const
const league = await createSportsLeague(db, users[0].id, { name: `Settlement IT ${run}`, emoji: "🏒", accent: "emerald", sports: ["nfl", "nhl", "mls"], startingCredits: 1000, endsAt: null })
for (const u of users.slice(1)) await db.insert(schema.sportsMembers).values({ leagueId: league.id, userId: u.id, credits: 1000 })

const published = await publishLines(db, fixtureOdds([mls, nhl, nhlTie, nfl]), ["mls", "nhl", "nfl"], now)
assert.ok(published.every((p) => p.published > 0), `every sport published: ${JSON.stringify(published)}`)

const marketOf = async (e: ProviderEvent, key = "moneyline|") => {
  const [event] = await db.select().from(schema.sportsEvents).where(eq(schema.sportsEvents.externalId, e.externalId))
  assert.ok(event, `event ${e.externalId} published`)
  const [market] = (await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.eventId, event.id))).filter((m) => m.marketKey === key)
  assert.ok(market, `${key} market published`)
  const lines = await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.marketId, market.id))
  return { event, market, line: (sel: string) => lines.find((l) => l.selection === sel)! }
}
const pick = (userId: string, line: { id: string; price: number; point: number | null }, at = now, stake = 100) =>
  placeSportsPick(db, userId, league.id, { lineId: line.id, stake, expectedPrice: line.price, expectedPoint: line.point, requestId: randomUUID() }, at)
const rejects = async (p: Promise<unknown>) => p.then(() => null, (e: unknown) => (e instanceof SportsError ? e.message : String(e)))
const credits = async (userId: string) => (await db.select().from(schema.sportsMembers).where(eq(schema.sportsMembers.userId, userId)))[0]!.credits
const pickStatus = async (userId: string, marketId: string) =>
  (await db.select().from(schema.sportsPicks).innerJoin(schema.sportsMembers, eq(schema.sportsMembers.id, schema.sportsPicks.memberId)).where(eq(schema.sportsMembers.userId, userId))).find((r) => r.sports_picks.marketId === marketId)!.sports_picks.status
/** Pretend a game started `ago` before `at`, lock its markets, as the cron would. */
const startedAgo = async (e: ProviderEvent, at: Date, ago: number) => {
  const { event } = await marketOf(e)
  moved.set(e.externalId, new Date(at.getTime() - ago))
  await db.update(schema.sportsEvents).set({ startsAt: new Date(at.getTime() - ago) }).where(eq(schema.sportsEvents.id, event.id))
  await db.update(schema.sportsMarkets).set({ lockAt: new Date(at.getTime() - ago) }).where(eq(schema.sportsMarkets.eventId, event.id))
  await lockDueMarkets(db, at)
}

// ---- 1. MLS three-way: draw is a real line; 1-1 pays the draw, loses home and away ----
const M = await marketOf(mls)
assert.deepEqual(["away", "draw", "home"], (await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.marketId, M.market.id))).map((l) => l.selection).sort(), "MLS moneyline has home/draw/away")
assert.ok(M.line("draw").price > 0, "draw is a plus price")
// ids that cannot all be favorites: sum of implied probabilities is above 1 (hold), so each side is priced
await pick(users[0].id, M.line("draw"))
await pick(users[1].id, M.line("home"))
await pick(users[2].id, M.line("away"))
assert.equal(await credits(users[0].id), 900)
console.log("1a MLS three-way published and picked on draw/home/away")

// ---- 2. NHL two-family quorum; NFL tie pushes; NHL tie voids ----
const N = await marketOf(nhl)
const T = await marketOf(nhlTie)
const F = await marketOf(nfl)
await pick(users[0].id, N.line("home"))
await pick(users[1].id, T.line("home"))
await pick(users[2].id, F.line("away"))

const settleAt = new Date(now.getTime() + 24 * 3600_000)
for (const e of [mls, nhl, nhlTie, nfl]) await startedAgo(e, settleAt, 12 * 3600_000)

// MLS: one family (ESPN) settles, but only after the single-source delay and when the score is unchanged on the second sighting.
const espn = (rows: EventResult[]) => source("espn", "espn", rows)
const nhlApi = (rows: EventResult[]) => source("nhl-api", "nhl-api", rows, ["nhl"])
const rows = {
  mls: resultsFor(mls, "espn", "espn", 1, 1),
  nflTie: resultsFor(nfl, "espn", "espn", 20, 20),
  nhlE: resultsFor(nhl, "espn", "espn", 4, 2),
  nhlN: resultsFor(nhl, "nhl-api", "nhl-api", 4, 2),
  tieE: resultsFor(nhlTie, "espn", "espn", 3, 3),
  tieN: resultsFor(nhlTie, "nhl-api", "nhl-api", 3, 3),
}

// Run A: ESPN only (NHL's second family is down). The NHL pick must NOT settle on one family when two are expected.
let out = await settleDueEvents(db, [espn([rows.mls, rows.nflTie, rows.nhlE, rows.tieE])], settleAt, twoFamilies)
assert.equal(await pickStatus(users[0].id, N.market.id), "open", "NHL does not settle on one family when two are configured")
assert.equal(await pickStatus(users[0].id, M.market.id), "open", "MLS final is first seen: waiting out the safety delay")
console.log("2a one family alone: NHL waits, MLS waits for the delay", JSON.stringify(out))

// Run B: both NHL families agree, after the delay has passed for everything.
const later = new Date(settleAt.getTime() + 7 * 3600_000)
out = await settleDueEvents(db, [espn([rows.mls, rows.nflTie, rows.nhlE, rows.tieE]), nhlApi([rows.nhlN, rows.tieN])], later, twoFamilies)
assert.ok(out.settled + out.voided >= 4, `all four events resolved: ${JSON.stringify(out)}`)

assert.equal(await pickStatus(users[0].id, M.market.id), "won", "draw wins a 1-1")
assert.equal(await pickStatus(users[1].id, M.market.id), "lost", "home loses a 1-1")
assert.equal(await pickStatus(users[2].id, M.market.id), "lost", "away loses a 1-1")
assert.equal(await pickStatus(users[0].id, N.market.id), "won", "NHL home pick wins 4-2 on two families")
assert.equal(await pickStatus(users[2].id, F.market.id), "push", "NFL tie pushes")
assert.equal(await pickStatus(users[1].id, T.market.id), "void", "NHL tie voids")
// Money: draw paid its total return, losers lost the stake, push and void refunded in full.
const drawPick = (await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.marketId, M.market.id))).find((p) => p.selection === "draw")!
// user0 also won the NHL pick; user1 lost MLS home (-100) and got the NHL-tie refund; user2 lost MLS away (-100) and got the NFL push back.
const nhlPick = (await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.marketId, N.market.id)))[0]!
assert.equal(await credits(users[0].id), 1000 - 100 - 100 + drawPick.totalReturn + nhlPick.totalReturn)
assert.equal(await credits(users[1].id), 1000 - 100 - 100 + 100)
assert.equal(await credits(users[2].id), 1000 - 100 - 100 + 100)
console.log("2b MLS 1-1: draw won/home lost/away lost; NHL two-family quorum; NFL tie push; NHL tie void; credits reconcile")

// Settling again changes nothing (idempotent ledger).
const before = await sql`SELECT count(*)::int AS n FROM sports_ledger`
await settleDueEvents(db, [espn([rows.mls, rows.nflTie, rows.nhlE, rows.tieE]), nhlApi([rows.nhlN, rows.tieN])], new Date(later.getTime() + 3600_000), twoFamilies)
assert.deepEqual(await sql`SELECT count(*)::int AS n FROM sports_ledger`, before)
console.log("2c re-settling is idempotent")

// ---- 3. Single-source safety net: a changed score goes to review, picks stay open ----
{
  const e = ev("mls", 2, "mlschange")
  await publishLines(db, fixtureOdds([e]), ["mls"], now)
  const C = await marketOf(e)
  await pick(users[0].id, C.line("draw"))
  const at = new Date(now.getTime() + 48 * 3600_000)
  await startedAgo(e, at, 10 * 3600_000)
  await settleDueEvents(db, [espn([resultsFor(e, "espn", "espn", 1, 1)])], at, oneFamily)
  const out2 = await settleDueEvents(db, [espn([resultsFor(e, "espn", "espn", 2, 1)])], new Date(at.getTime() + 3600_000), oneFamily)
  assert.ok(out2.review >= 1, "a changed final goes to review")
  assert.equal(await pickStatus(users[0].id, C.market.id), "open")
  console.log("3 single-source score change -> review, pick stays open")
}

// ---- 4. Frozen / locked / hidden markets are not pickable ----
{
  const e = ev("nfl", 2, "nflfrozen")
  await publishLines(db, fixtureOdds([e]), ["nfl"], now)
  const Z = await marketOf(e)
  assert.equal(await freezeForReason(db, Z.market.id, "test freeze"), true)
  const msg = await rejects(pick(users[0].id, Z.line("home")))
  assert.match(msg ?? "", /closed/i, "frozen market refuses picks")
  const [row] = await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, Z.market.id))
  assert.ok(row!.frozenReason)

  // A market that never published (hidden by a gate) has no line to pick: the lookup 404s.
  const hidden = await rejects(placeSportsPick(db, users[0].id, league.id, { lineId: randomUUID(), stake: 10, expectedPrice: -110, expectedPoint: null, requestId: randomUUID() }, now))
  assert.match(hidden ?? "", /not found/i)
  console.log("4 frozen market closed to picks; unknown (hidden) line 404s")
}

// ---- 5. Kickoff lock: allowed a minute before, refused at and after the start ----
{
  const e = ev("nhl", 3, "nhlkick")
  await publishLines(db, fixtureOdds([e]), ["nhl"], now)
  const K = await marketOf(e)
  const kickoff = e.startsAt
  assert.equal(await rejects(pick(users[2].id, K.line("home"), new Date(kickoff.getTime() - 60_000), 10)), null, "pick accepted a minute before kickoff")
  assert.match((await rejects(pick(users[1].id, K.line("away"), kickoff, 10))) ?? "", /closed/i, "refused at kickoff")
  assert.match((await rejects(pick(users[0].id, K.line("away"), new Date(kickoff.getTime() + 60_000), 10))) ?? "", /closed/i, "refused after kickoff")
  console.log("5 kickoff lock ok")
}

// ---- 6. No worker heartbeat: close 60 min before kickoff; reopen when the worker is back ----
{
  const e = { ...ev("nfl", 3, "nflworker"), startsAt: new Date(now.getTime() + 2 * 3600_000) }
  await publishLines(db, fixtureOdds([e]), ["nfl"], now)
  const W = await marketOf(e)
  await sql`DELETE FROM live_worker WHERE name = 'live-odds'`
  let r = await freezeUnguardedMarkets(db, new Date(now.getTime() + 61 * 60_000)) // 59 min to kickoff
  assert.ok(r.frozen >= 1 && !r.workerAlive)
  assert.equal((await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, W.market.id)))[0]!.status, "locked")
  const at = new Date(now.getTime() + 62 * 60_000)
  await db.insert(schema.liveWorker).values({ name: "live-odds", lastCycleAt: at }).onConflictDoUpdate({ target: schema.liveWorker.name, set: { lastCycleAt: at } })
  r = await freezeUnguardedMarkets(db, at)
  assert.ok(r.workerAlive && r.reopened >= 1)
  assert.equal((await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, W.market.id)))[0]!.status, "open")
  await sql`DELETE FROM live_worker WHERE name = 'live-odds'`
  console.log("6 no-worker early lock is reversible")
}
console.log("sports settlement integration: PASS")
await sql.end()
