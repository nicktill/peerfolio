/**
 * Local sports demo. Needs `npm run db:seed` first (it creates the users).
 *
 *   npm run sports:seed            publish mock lines + create a demo league with a few picks
 *   npm run sports:settle-demo     pretend every game just ended, settle with canned results
 *
 * Uses the offline mock provider only: no network, no API keys.
 */
import { config } from "dotenv"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { MockProvider } from "../src/lib/sports/providers/mock.ts"
import { DEFAULT_RESOLVE } from "../src/lib/sports/settlement.ts"
import { createSportsLeague, joinSportsLeague, placeSportsPick, publishLines, settleDueEvents } from "../src/lib/sports/store.ts"
import { SPORTS } from "../src/lib/sports/types.ts"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.")
  process.exit(1)
}
const sql = postgres(url, { max: 1, prepare: false })
const db = drizzle(sql, { schema })

async function seed() {
  const users = await db.select().from(schema.users).limit(4)
  if (users.length === 0) throw new Error("No users. Run `npm run db:seed` first.")

  const now = new Date()
  const published = await publishLines(db, new MockProvider(), SPORTS, now)
  console.log("Published lines:", published.map((p) => `${p.sport}=${p.published}`).join(" "))

  const [existing] = await db.select().from(schema.sportsLeagues).where(eq(schema.sportsLeagues.name, "Demo Sharps")).limit(1)
  if (existing) {
    console.log(`Demo league already exists. Invite code ${existing.inviteCode}`)
    return
  }
  const league = await createSportsLeague(db, users[0]!.id, {
    name: "Demo Sharps",
    emoji: "🏈",
    accent: "emerald",
    sports: ["nfl", "nba", "tennis"],
    startingCredits: 1000,
    endsAt: null,
  })
  for (const u of users.slice(1)) await joinSportsLeague(db, u.id, league.inviteCode)

  // A few picks per member so standings and history have something in them.
  const lines = await db
    .select({ line: schema.sportsLines, market: schema.sportsMarkets })
    .from(schema.sportsLines)
    .innerJoin(schema.sportsMarkets, eq(schema.sportsMarkets.id, schema.sportsLines.marketId))
  let n = 0
  for (const [i, u] of users.entries()) {
    for (const pick of lines.filter((_, j) => (j + i) % 7 === 0).slice(0, 3)) {
      try {
        await placeSportsPick(
          db,
          u.id,
          league.id,
          { lineId: pick.line.id, stake: 25 + i * 10, expectedPrice: pick.line.price, expectedPoint: pick.line.point, requestId: `seed-${u.id}-${pick.line.id}` },
          now,
        )
        n++
      } catch (error) {
        console.log("  skipped a pick:", error instanceof Error ? error.message : error)
      }
    }
  }
  console.log(`Created "Demo Sharps" with ${users.length} members and ${n} picks. Invite code ${league.inviteCode}`)
}

async function settleDemo() {
  // Pretend every scheduled game started 3 hours ago and its markets are locked.
  const past = new Date(Date.now() - 3 * 3600_000)
  const events = await db.select().from(schema.sportsEvents).where(eq(schema.sportsEvents.status, "scheduled"))
  const results: Record<string, { status: "final"; homeScore: number; awayScore: number; playerStats: Record<string, Record<string, number>> }> = {}
  for (const e of events) {
    await db.update(schema.sportsEvents).set({ startsAt: past }).where(eq(schema.sportsEvents.id, e.id))
    await db.update(schema.sportsMarkets).set({ status: "locked", lockAt: past }).where(eq(schema.sportsMarkets.eventId, e.id))
    const props = await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.eventId, e.id))
    const playerStats: Record<string, Record<string, number>> = {}
    for (const m of props) if (m.player && m.statKey) playerStats[m.player] = { [m.statKey]: m.statKey === "player_pass_yds" ? 262 : 31 }
    results[e.externalId] = {
      status: "final",
      homeScore: e.sport === "nba" ? 118 : e.sport === "tennis" ? 2 : 27,
      awayScore: e.sport === "nba" ? 109 : e.sport === "tennis" ? 1 : 20,
      playerStats,
    }
  }
  const out = await settleDueEvents(db, [new MockProvider(results)], new Date(), { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 })
  console.log("Settlement:", out)
}

try {
  const cmd = process.argv[2]
  if (cmd === "seed") await seed()
  else if (cmd === "settle") await settleDemo()
  else console.log("Usage: sports-demo.ts seed | settle")
} finally {
  await sql.end()
}
