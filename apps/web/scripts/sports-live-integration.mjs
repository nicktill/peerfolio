/** Replay captured live provider responses against a NEW disposable LOCAL database.
 * Run from apps/web: node --experimental-strip-types scripts/sports-live-integration.mjs
 * Requires /private/tmp/peerfolio-live-provider-evidence.json from the bounded provider probe.
 * Makes NO paid provider calls. The actual Next API handles login, league creation and pick placement.
 * Settlement replays two independently captured live final scores using synthetic historical prices.
 * It does not pretend that a newly placed future-game pick has already finished.
 */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { cp, mkdir, readFile, symlink, writeFile, open } from "node:fs/promises"
import { createServer } from "node:http"
import { spawn } from "node:child_process"
import path from "node:path"
import { config } from "dotenv"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { eq, sql } from "drizzle-orm"
import * as schema from "../src/db/schema.ts"
import { createSportsLeague, placeSportsPick, publishLines, settleDueEvents } from "../src/lib/sports/store.ts"
import { DEFAULT_RESOLVE } from "../src/lib/sports/settlement.ts"

config({ path: ".env.local", quiet: true })
const source = process.cwd()
assert.ok(source.endsWith("/apps/web"), "Run from apps/web")
const local = new URL(process.env.DATABASE_URL)
assert.ok(["localhost", "127.0.0.1"].includes(local.hostname), "Local database only")
const evidence = JSON.parse(await readFile("/private/tmp/peerfolio-live-provider-evidence.json", "utf8"), (key, value) =>
  ["startsAt", "fetchedAt", "at", "lockAt"].includes(key) && typeof value === "string" && /^20\d\d-/.test(value) ? new Date(value) : value)
const dbName = `peerfolio_live_qa_${Date.now()}`
const root = `/private/tmp/${dbName}`
const admin = postgres(local.toString(), { max: 1, onnotice: () => {} })
local.pathname = `/${dbName}`
let client, server, serverLog, failingProvider
const cronSecret = randomUUID()
const report = { at: new Date().toISOString(), paidCalls: 0, database: dbName, checks: [], limitations: ["Completed-game settlement uses captured live scores and synthetic historical prices, with an injected test clock. A newly placed future-game pick has not been settled."] }
const check = (message) => { report.checks.push(message); console.log(`PASS ${message}`) }
try {
  await admin.unsafe(`CREATE DATABASE "${dbName}"`)
  client = postgres(local.toString(), { max: 5, prepare: false, onnotice: () => {} })
  const db = drizzle(client, { schema })
  await migrate(db, { migrationsFolder: path.join(source, "drizzle") })
  const userId = randomUUID()
  await db.insert(schema.users).values({ id: userId, email: "sports-live-qa@example.com", name: "Integration Tester" })
  const fixed = { name: "captured-live-odds", fetchOdds: async (sport) => evidence.sports[sport].odds }
  const published = await publishLines(db, fixed, ["nfl", "nba"], evidence.at)
  assert.ok(published.some((p) => p.published > 0), "No live markets published")
  check("Live-captured markets publish through the actual database layer")

  await mkdir(path.join(root, "apps"), { recursive: true })
  const app = path.join(root, "apps/web")
  await cp(source, app, { recursive: true, filter: (entry) => !["node_modules", ".next"].includes(path.basename(entry)) && !path.basename(entry).startsWith(".env") })
  await cp(path.resolve(source, "../../packages"), path.join(root, "packages"), { recursive: true, filter: (entry) => path.basename(entry) !== "node_modules" })
  await cp(path.resolve(source, "../../package.json"), path.join(root, "package.json"))
  await symlink(path.join(source, "node_modules"), path.join(app, "node_modules"))
  await symlink(path.resolve(source, "../../node_modules"), path.join(root, "node_modules"))
  const port = 3107
  const origin = `http://127.0.0.1:${port}`
  serverLog = await open(path.join(root, "server.log"), "w", 0o600)
  failingProvider = createServer((_req, res) => { res.writeHead(503, { "content-type": "application/json" }); res.end('{"error":"intentional local outage"}') })
  await new Promise((resolve) => failingProvider.listen(3108, "127.0.0.1", resolve))
  server = spawn(process.execPath, [path.join(source, "node_modules/next/dist/bin/next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: app, stdio: ["ignore", serverLog.fd, serverLog.fd],
    env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: "development", DATABASE_URL: local.toString(), ENABLE_DEV_LOGIN: "true", NEXTAUTH_SECRET: randomUUID(), NEXTAUTH_URL: origin, NEXT_PUBLIC_SPORTS_ENABLED: "1", SPORTS_MOCK: "0", SPORTS_ODDS_SOURCE: "odds-api", SPORTS_MIN_RESULT_SOURCES: "2", SPORTS_FETCH_GATE: "0", CRON_SECRET: cronSecret, PROPLINE_API_KEY: "local-test-only", PROPLINE_BASE_URL: "http://127.0.0.1:3108/v4", NEXT_TELEMETRY_DISABLED: "1" },
  })
  for (let i = 0; i < 90; i++) {
    if (server.exitCode != null) throw Error("Isolated test server exited; inspect server.log")
    try { if ((await fetch(`${origin}/api/health`)).ok) break } catch {}
    if (i === 89) throw Error("Test server startup timed out")
    await new Promise((resolve) => setTimeout(resolve, 1000))
  }
  const jar = new Map()
  async function request(route, options = {}) {
    const headers = new Headers(options.headers)
    if (jar.size) headers.set("cookie", [...jar].map(([key, value]) => `${key}=${value}`).join("; "))
    const response = await fetch(origin + route, { ...options, headers, redirect: "manual" })
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0]; const split = pair.indexOf("="); jar.set(pair.slice(0, split), pair.slice(split + 1)) }
    const body = await response.json().catch(() => null)
    return { status: response.status, body }
  }
  const csrf = await request("/api/auth/csrf")
  assert.equal(csrf.status, 200)
  await request("/api/auth/callback/dev-login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ csrfToken: csrf.body.csrfToken, email: "sports-live-qa@example.com", callbackUrl: origin + "/fantasy", json: "true" }) })
  const session = await request("/api/auth/session")
  assert.equal(session.body?.user?.email, "sports-live-qa@example.com")
  check("Real NextAuth session established on isolated server")
  const post = (route, body) => request(route, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) })
  const created = await post("/api/sports/leagues", { name: "Live feed integration QA", sports: ["nfl", "nba"], startingCredits: 1000 })
  assert.equal(created.status, 201, JSON.stringify(created.body))
  const leagueId = created.body.league.id
  const detail = await request(`/api/sports/leagues/${leagueId}`)
  assert.equal(detail.status, 200)
  const market = detail.body.markets.find((market) => market.kind === "moneyline")
  assert.ok(market, "No selectable live market")
  const line = market.lines[0]
  const pickBody = { lineId: line.id, stake: 10, expectedPrice: line.price, expectedPoint: line.point, requestId: randomUUID() }
  const placed = await post(`/api/sports/leagues/${leagueId}/picks`, pickBody)
  assert.equal(placed.status, 201, JSON.stringify(placed.body))
  const replayed = await post(`/api/sports/leagues/${leagueId}/picks`, pickBody)
  assert.equal(replayed.status, 200, JSON.stringify(replayed.body))
  assert.equal(replayed.body.pick.id, placed.body.pick.id)
  const after = await request(`/api/sports/leagues/${leagueId}`)
  assert.equal(after.body.you.credits, 990)
  assert.equal(after.body.picks.length, 1)
  report.futurePick = { game: `${market.event.away} @ ${market.event.home}`, startsAt: market.event.startsAt, price: line.price, stake: 10, requestReplayStatus: replayed.status }
  check("Private league creation, live-market pick placement and duplicate replay pass through real HTTP APIs")
  const refused = await post(`/api/sports/leagues/${leagueId}/picks`, { ...pickBody, requestId: randomUUID(), expectedPrice: line.price + 1 })
  assert.ok(refused.status >= 400 && refused.status < 500)
  check("Invalid/repeated market submission is rejected without a second debit")

  const unauthenticatedCron = await request("/api/cron/sports/publish")
  assert.equal(unauthenticatedCron.status, 403)
  const outage = await request("/api/cron/sports/publish", { headers: { authorization: `Bearer ${cronSecret}` } })
  assert.equal(outage.status, 503, JSON.stringify(outage.body))
  assert.equal(outage.body.health.status, "unavailable")
  const misconfigured = await request("/api/cron/sports/settle", { headers: { authorization: `Bearer ${cronSecret}` } })
  assert.equal(misconfigured.status, 503)
  assert.match(misconfigured.body.error, /independent results providers/)
  check("Actual cron routes reject missing authorization and report provider outages/quorum misconfiguration with HTTP 503")

  // Historical replay: actual independently fetched final scores, deliberately synthetic prices and test time.
  const pair = evidence.sports.nfl.matched.find((row) => row.matches.some((match) => match.status === "final" && match.homeScore === row.event.homeScore && match.awayScore === row.event.awayScore))
  assert.ok(pair, "No agreed completed NFL result in captured evidence")
  const final = pair.event
  const before = new Date(final.startsAt.getTime() - 12 * 3600_000)
  const historicalEvent = { externalId: final.externalId, family: "the-odds-api", sport: "nfl", homeName: final.homeName, awayName: final.awayName, startsAt: final.startsAt, markets: [{ key: "moneyline", kind: "moneyline", outcomes: ["home", "away"].map((selection) => ({ selection, quotes: ["fixture-a", "fixture-b", "fixture-c"].map((book) => ({ book, price: -110, point: null, at: before })) })) }] }
  await publishLines(db, { name: "historical-price-fixture", fetchOdds: async () => ({ provider: "historical-price-fixture", fetchedAt: before, events: [historicalEvent] }) }, ["nfl"], before)
  const [event] = await db.select().from(schema.sportsEvents).where(eq(schema.sportsEvents.externalId, final.externalId))
  const [historicalMarket] = await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.eventId, event.id))
  assert.ok(historicalMarket, "Historical fixture market not published")
  const [historicalLine] = await db.select().from(schema.sportsLines).where(eq(schema.sportsLines.marketId, historicalMarket.id))
  const historyLeague = await createSportsLeague(db, userId, { name: "Historical replay QA", sports: ["nfl"], emoji: "🏈", accent: "emerald", startingCredits: 1000, endsAt: null })
  const historicalPick = await placeSportsPick(db, userId, historyLeague.id, { lineId: historicalLine.id, stake: 10, expectedPrice: historicalLine.price, expectedPoint: historicalLine.point, requestId: randomUUID() }, before)
  assert.ok(historicalPick.pick.id)
  const sources = [{ name: "the-odds-api", family: "the-odds-api", fetchResults: async () => [final] }, { name: "espn", family: "espn", fetchResults: async () => pair.matches }]
  const now = new Date()
  const first = await settleDueEvents(db, sources, now)
  assert.ok(first.waiting > 0)
  const beforeSettlement = await client`select credits from sports_members where league_id=${historyLeague.id}`
  assert.equal(Number(beforeSettlement[0].credits), 990)
  check("Two live-source scores agree; default six-hour settlement delay prevents immediate payout")
  const later = new Date(now.getTime() + DEFAULT_RESOLVE.settleDelayMs + 1000)
  const settled = await settleDueEvents(db, sources, later)
  assert.ok(settled.settled > 0)
  const balances = await client`select credits from sports_members where league_id=${historyLeague.id}`
  const count = await client`select count(*)::int as n from sports_ledger`
  const again = await settleDueEvents(db, sources, later)
  const afterBalances = await client`select credits from sports_members where league_id=${historyLeague.id}`
  const afterCount = await client`select count(*)::int as n from sports_ledger`
  assert.deepEqual(afterBalances, balances)
  assert.equal(afterCount[0].n, count[0].n)
  assert.equal(again.settled, 0)
  const mismatches = await db.execute(sql`select m.id from sports_members m where m.credits <> (select coalesce(sum(l.amount),0) from sports_ledger l where l.member_id=m.id)`)
  assert.equal(mismatches.length, 0)
  check("Completed-game replay settles after delay; second settlement pays nothing; all ledgers match")
  report.historicalReplay = { game: `${final.awayName} @ ${final.homeName}`, homeScore: final.homeScore, awayScore: final.awayScore, syntheticPrices: true, simulatedClock: true, settledMarkets: settled.settled, resultingCredits: balances[0].credits }
} catch (error) {
  report.failure = error.message
  console.error("FAIL", error.message)
  process.exitCode = 1
} finally {
  failingProvider?.close()
  server?.kill("SIGTERM")
  if (server) await Promise.race([new Promise((resolve) => server.once("exit", resolve)), new Promise((resolve) => setTimeout(resolve, 5000))])
  await serverLog?.close()
  await client?.end({ timeout: 5 })
  await admin.unsafe(`DROP DATABASE IF EXISTS "${dbName}" WITH (FORCE)`)
  await admin.end()
  report.databaseDropped = true
  await writeFile("/private/tmp/peerfolio-live-integration-report.json", JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log("Evidence: /private/tmp/peerfolio-live-integration-report.json")
  // Keep the isolated source/server log for diagnosis; it contains no provider key or production config.
}
