/**
 * Concurrency stress for sports picks (needs a local database, not part of `npm test`):
 *
 *   npm run sports:stress
 *
 * Many members place picks while the same markets are voided and an event is
 * settled. Lock order (market, then members) must prevent deadlocks, and the ledger must
 * still equal every member's credits afterwards. Prints a summary and exits non-zero on failure.
 */
import { config } from "dotenv"
import { eq, sql } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { MockProvider } from "../src/lib/sports/providers/mock.ts"
import { DEFAULT_RESOLVE } from "../src/lib/sports/settlement.ts"
import { createSportsLeague, joinSportsLeague, placeSportsPick, publishLines, settleDueEvents, voidMarket } from "../src/lib/sports/store.ts"

config({ path: ".env.local" })
config({ path: ".env" })
const client = postgres(process.env.DATABASE_URL!, { max: 20, prepare: false })
const db = drizzle(client, { schema })

const ROUNDS = Number(process.env.ROUNDS ?? 15)
let deadlocks = 0
let placed = 0
let refused = 0

async function main() {
  const users = await db.select().from(schema.users).limit(5)
  if (users.length < 3) throw new Error("Run `npm run db:seed` first")
  for (let round = 0; round < ROUNDS; round++) {
    await client`truncate sports_notifications, sports_ledger, sports_picks, sports_lines, sports_markets, sports_events, sports_members, sports_leagues cascade`
    const now = new Date()
    await publishLines(db, new MockProvider(), ["nfl"], now)
    const league = await createSportsLeague(db, users[0]!.id, { name: "Stress", emoji: "🏈", accent: "emerald", sports: ["nfl"], startingCredits: 1000, endsAt: null })
    for (const u of users.slice(1)) await joinSportsLeague(db, u.id, league.inviteCode)
    const lines = await db.select().from(schema.sportsLines)
    const markets = await db.select().from(schema.sportsMarkets)

    const work: Promise<unknown>[] = []
    for (const [i, line] of lines.entries()) {
      const u = users[i % users.length]!
      work.push(
        placeSportsPick(db, u.id, league.id, { lineId: line.id, stake: 10, expectedPrice: line.price, expectedPoint: line.point, requestId: `r${round}-${i}-${Math.random()}` }, now).then(
          () => void placed++,
          (e: { code?: string; cause?: { code?: string }; message: string }) => {
            if ((e.code ?? e.cause?.code) === "40P01") deadlocks++
            else refused++
          },
        ),
      )
    }
    // Voids race the picks, and an event settles at the same moment.
    for (const m of markets.slice(0, 6)) work.push(voidMarket(db, m.id, "stress", new Date()).catch((e) => void (((e.code ?? e.cause?.code) === "40P01") && deadlocks++)))
    const past = new Date(Date.now() - 3 * 3600_000)
    const [ev] = await db.select().from(schema.sportsEvents).limit(1)
    if (ev) {
      await db.update(schema.sportsEvents).set({ startsAt: past }).where(eq(schema.sportsEvents.id, ev.id))
      const results = { [ev.externalId]: { status: "final" as const, homeScore: 27, awayScore: 20 } }
      work.push(settleDueEvents(db, [new MockProvider(results)], new Date(), { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 }).catch((e) => void (((e.code ?? e.cause?.code) === "40P01") && deadlocks++)))
    }
    await Promise.all(work)
    // Anything still open on a void market is refunded by the sweep.
    await settleDueEvents(db, [new MockProvider()], new Date(), { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 })

    const bad = await db.execute(sql`SELECT m.id FROM sports_members m WHERE m.credits <> (SELECT COALESCE(SUM(amount),0) FROM sports_ledger l WHERE l.member_id = m.id)`)
    const stuck = await db.execute(sql`SELECT p.id FROM sports_picks p JOIN sports_markets k ON k.id = p.market_id WHERE p.status = 'open' AND k.status = 'void'`)
    if (bad.length || stuck.length) throw new Error(`round ${round}: ${bad.length} ledger mismatches, ${stuck.length} picks left open on void markets`)
  }
  console.log(`OK: ${ROUNDS} rounds, ${placed} picks placed, ${refused} refused, ${deadlocks} deadlocks surfaced, 0 ledger mismatches`)
  if (deadlocks > 0) process.exitCode = 1
}

try {
  await main()
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await client.end()
}
