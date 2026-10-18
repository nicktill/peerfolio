/** Run from apps/web: node --experimental-strip-types scripts/e2e-sports-local.mjs
 * Requires SPORTS_TEST_DATABASE_URL for disposable Postgres on 127.0.0.1:55440. Creates and drops its OWN database.
 * Ignores DATABASE_URL and .env files. Providers are fixtures; no production or paid API access.
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import postgres from 'postgres'
import { drizzle } from 'drizzle-orm/postgres-js'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { and, eq, sql } from 'drizzle-orm'
import * as schema from '../src/db/schema.ts'
import { createSportsLeague, placeSportsPick, placeSportsParlay, settleDueEvents, takeRateLimit } from '../src/lib/sports/store.ts'
import { quoteCashout, cashOutPick } from '../src/lib/sports/cashout-store.ts'
import { quoteParlayCashout, cashOutParlay } from '../src/lib/sports/parlay-cashout-store.ts'
import { DEFAULT_RESOLVE, resolveConfigForSport } from '../src/lib/sports/settlement.ts'
import { normalizeCompetition } from '../src/lib/sports/providers/espn.ts'
import { requestIsSameOrigin } from '../src/lib/request-origin.ts'

const name = `pf_sports_e2e_${randomUUID().replaceAll('-', '')}`
const local = new URL(process.env.SPORTS_TEST_DATABASE_URL ?? 'postgresql://127.0.0.1:55440/postgres')
assert.equal(local.hostname, '127.0.0.1', 'Disposable local database only')
assert.equal(local.port, '55440', 'Disposable test port only')
assert.ok(['postgres:', 'postgresql:'].includes(local.protocol))
local.pathname = '/postgres'
const admin = postgres(local.toString(), { max: 1, onnotice: () => {} })
let client
const passed = []
const check = (label) => { passed.push(label); console.log(`PASS ${label}`) }
try {
  await admin.unsafe(`CREATE DATABASE "${name}"`)
  local.pathname = `/${name}`
  const url = local.toString()
  client = postgres(url, { max: 10, prepare: false, onnotice: () => {} })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: './drizzle' })
  check('all migrations apply to an empty disposable database')
  const [user] = await db.insert(schema.users).values({ email: `${name}@example.test` }).returning()
  const league = await createSportsLeague(db, user.id, { name: 'Local flow check', emoji: '🏈', accent: 'emerald', sports: ['nfl', 'epl'], startingCredits: 10000, endsAt: null })
  const now = new Date()
  const start = new Date(+now + 3600000)
  const makeMarket = async (n, sport = 'nfl') => {
    const [event] = await db.insert(schema.sportsEvents).values({ sport, externalId: `${name}-${n}`, homeName: `Home ${n}`, awayName: `Away ${n}`, startsAt: start }).returning()
    const [market] = await db.insert(schema.sportsMarkets).values({ eventId: event.id, marketKey: 'moneyline|', kind: 'moneyline', lockAt: start, booksUsed: 1 }).returning()
    const [line] = await db.insert(schema.sportsLines).values({ marketId: market.id, selection: 'home', price: -110, publishedAt: now }).returning()
    return { event, market, line }
  }
  const member = async () => (await db.select().from(schema.sportsMembers).where(eq(schema.sportsMembers.leagueId, league.id)))[0]
  const invariant = async () => {
    const m = await member()
    const [r] = await db.select({ sum: sql`coalesce(sum(${schema.sportsLedger.amount}),0)::int` }).from(schema.sportsLedger).where(eq(schema.sportsLedger.memberId, m.id))
    assert.equal(m.credits, r.sum, 'balance equals ledger')
  }
  const request = (line, stake = 100, requestId = randomUUID()) => ({ lineId: line.id, expectedPrice: line.price, expectedPoint: line.point, stake, requestId })
  const a = await makeMarket(1)
  const first = await placeSportsPick(db, user.id, league.id, request(a.line), now)
  const quote = await quoteCashout(db, user.id, league.id, first.pick.id, now)
  assert.equal(quote.available, true); assert.equal(quote.value, 100)
  const sold = await Promise.all(Array.from({ length: 6 }, () => cashOutPick(db, user.id, league.id, first.pick.id, 100, now)))
  assert.equal(sold.filter(x => !x.replayed).length, 1)
  assert.equal((await member()).credits, 10000)
  assert.equal((await cashOutPick(db, user.id, league.id, first.pick.id, 100, now)).replayed, true)
  await invariant(); check('unchanged single returns stake; six simultaneous cash-outs and retry credit once')
  const b = await makeMarket(2)
  const initial = await placeSportsPick(db, user.id, league.id, request(b.line), now)
  const rid = randomUUID()
  const added = await Promise.all(Array.from({ length: 4 }, () => placeSportsPick(db, user.id, league.id, request(b.line, 50, rid), now)))
  assert.ok(added.every(x => x.pick.id === initial.pick.id))
  const [merged] = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.id, initial.pick.id))
  assert.equal(merged.stake, 150)
  assert.equal((await member()).credits, 9850)
  await invariant(); check('concurrent add-more retries merge into one pick and debit once')
  const c = await makeMarket(3), d = await makeMarket(4)
  const parlay = await placeSportsParlay(db, user.id, league.id, { stake: 100, legs: [c.line, d.line].map(l => ({ lineId: l.id, expectedPrice: l.price, expectedPoint: l.point })), requestId: randomUUID() }, now)
  const pq = await quoteParlayCashout(db, user.id, league.id, parlay.parlay.id, now)
  assert.equal(pq.available, true); assert.equal(pq.value, 100)
  const ps = await Promise.all(Array.from({ length: 4 }, () => cashOutParlay(db, user.id, league.id, parlay.parlay.id, 100, now)))
  assert.equal(ps.filter(x => !x.replayed).length, 1)
  assert.equal((await member()).credits, 9850)
  await invariant(); check('unchanged parlay returns stake and concurrent requests credit once')
  // Final fixtures deliberately give every home side a win; cashed-out positions must remain sold.
  const after = new Date(+start + 4 * 3600000)
  const rows = [a,b,c,d].map(x => ({ source: 'espn', externalId: x.event.externalId, status: 'final', homeScore: 24, awayScore: 17, officialFinal: true }))
  const provider = { name: 'espn', fetchResults: async () => rows }
  await settleDueEvents(db, [provider], after, { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 })
  await settleDueEvents(db, [provider], new Date(+after + 1000), { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 })
  const [paid] = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.id, initial.pick.id))
  assert.equal(paid.status, 'won')
  assert.equal((await member()).credits, 9850 + merged.totalReturn)
  const balance = (await member()).credits
  await settleDueEvents(db, [provider], new Date(+after + 2000), { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 })
  assert.equal((await member()).credits, balance)
  await invariant(); check('settlement pays open pick once and skips cashed-out single and parlay')
  const soccer = await makeMarket(5, 'epl')
  const sp = await placeSportsPick(db, user.id, league.id, request(soccer.line), now)
  const result = normalizeCompetition({ id: soccer.event.externalId, date: start.toISOString(), status: { type: { name: 'STATUS_FULL_TIME', completed: true, state: 'post' } }, competitors: [{ homeAway: 'home', score: '2', team: { displayName: soccer.event.homeName } }, { homeAway: 'away', score: '1', team: { displayName: soccer.event.awayName } }] }, undefined, 'epl')
  assert.equal(result.officialFinal, true)
  const soccerProvider = { name: 'espn', fetchResults: async () => [result] }
  const cfg = resolveConfigForSport(DEFAULT_RESOLVE, 'epl', 1)
  for (const seconds of [0,45,90]) await settleDueEvents(db, [soccerProvider], new Date(+after + seconds*1000), cfg, undefined, { eventId: soccer.event.id })
  const [settled] = await db.select().from(schema.sportsPicks).where(eq(schema.sportsPicks.id, sp.pick.id))
  assert.equal(settled.status, 'won'); await invariant()
  check('soccer official full-time settles via three observations in 90 seconds')
  const limits = await Promise.all(Array.from({ length: 8 }, () => takeRateLimit(db, 'create', user.id, now, 3)))
  assert.equal(limits.filter(Boolean).length, 3)
  check('database rate limit admits exactly three of eight simultaneous attempts')
  assert.equal(requestIsSameOrigin(new Request('http://127.0.0.1:3100/api/sports/picks', { method: 'POST', headers: { origin: 'https://other.example' } })), false)
  assert.equal(requestIsSameOrigin(new Request('http://127.0.0.1:3100/api/sports/picks', { method: 'POST', headers: { origin: 'http://127.0.0.1:3100' } })), true)
  check('production origin-check function rejects cross-origin writes and accepts same-origin writes')
  for (const file of ['sports-settlement-integration.mts', 'sports-betting-integration.mts']) {
    const r = spawnSync(process.execPath, ['--experimental-strip-types', `scripts/${file}`], { stdio: 'inherit', env: { ...process.env, DATABASE_URL: url, SPORTS_DISABLED: 'tennis' } })
    assert.equal(r.status, 0, file)
    check(file)
  }
  console.log(`\n${passed.length} groups passed. Store/database integration verified; no HTTP authentication or browser coverage claimed.`)
} finally {
  if (client) await client.end({ timeout: 5 })
  await admin.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`)
  await admin.end({ timeout: 5 })
}
