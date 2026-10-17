/**
 * Sports half of `npm run preview:seed`. Runs after `sports:seed` and `sports:settle-demo`, so "Demo Sharps"
 * already has a settled round (picks won and lost, credits and standings moved).
 *
 * This adds a second batch of mock games (fresh external ids, kick-off later today) so the league also has
 * open lines to tap, and places one open pick per member so the "pending" state is visible too.
 * Offline: the mock provider only, no keys, no network.
 */
import { config } from "dotenv"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { MockProvider, mockEvent } from "../src/lib/sports/providers/mock.ts"
import { joinSportsLeague, placeSportsPick, publishLines } from "../src/lib/sports/store.ts"
import { SPORTS, type Sport } from "../src/lib/sports/types.ts"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.preview.example to .env.local first.")
  process.exit(1)
}
const sql = postgres(url, { max: 1, prepare: false })
const db = drizzle(sql, { schema })

/** The mock provider's games 4 to 6: same shapes as the first batch, different ids, later kick-offs. */
class LaterGames extends MockProvider {
  override async fetchOdds(sport: Sport, now: Date) {
    const events = [4, 5, 6].map((n) => mockEvent(sport, n, new Date(now.getTime() + (3 + n * 4) * 3600_000)))
    return { provider: this.name, fetchedAt: now, events }
  }
}

try {
  const [league] = await db.select().from(schema.sportsLeagues).where(eq(schema.sportsLeagues.name, "Demo Sharps")).limit(1)
  if (!league) throw new Error('"Demo Sharps" is missing. Run `npm run sports:seed` first.')

  const now = new Date()
  const published = await publishLines(db, new LaterGames(), SPORTS, now)
  console.log("Published later lines:", published.map((p) => `${p.sport}=${p.published}`).join(" "))

  // Everyone in the league, maya included, so the demo login sees the league as a member.
  const users = await db.select().from(schema.users)
  for (const u of users) await joinSportsLeague(db, u.id, league.inviteCode).catch(() => {})

  const open = await db
    .select({ line: schema.sportsLines, market: schema.sportsMarkets })
    .from(schema.sportsLines)
    .innerJoin(schema.sportsMarkets, eq(schema.sportsMarkets.id, schema.sportsLines.marketId))
    .where(eq(schema.sportsMarkets.status, "open"))
  let placed = 0
  for (const [i, u] of users.entries()) {
    const pick = open[(i * 5) % Math.max(open.length, 1)]
    if (!pick) continue
    try {
      await placeSportsPick(
        db,
        u.id,
        league.id,
        { lineId: pick.line.id, stake: 40 + i * 10, expectedPrice: pick.line.price, expectedPoint: pick.line.point, requestId: `preview-${u.id}-${pick.line.id}` },
        now,
      )
      placed++
    } catch (error) {
      console.log("  skipped an open pick:", error instanceof Error ? error.message : error)
    }
  }
  console.log(`Sports league "${league.name}": invite ${league.inviteCode}, ${open.length} open lines, ${placed} open picks placed`)
} finally {
  await sql.end()
}
