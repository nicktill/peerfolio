/**
 * Fills a local database with demo data so the app is worth looking at
 * immediately, without connecting a real brokerage.
 *
 * Builds its own client rather than importing `@web/db`, which is marked
 * server-only for Next and shouldn't be pulled into a plain Node script.
 *
 *   npm run db:seed --workspace=@repo/web
 */
import { config } from "dotenv"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { BENCHMARK_SEEDS, DAYS, DEMO_PEOPLE, MIXES, SECURITIES, makeRandom } from "../src/lib/demo-data.ts"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.")
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false })
const db = drizzle(sql, { schema })

const sum = (rows: [string, number][]) => rows.reduce((n, [, v]) => n + v, 0)

async function main() {
  console.log("Clearing existing data…")
  await sql`TRUNCATE ${sql(["users", "plaid_items", "accounts", "securities", "holdings", "portfolio_snapshots", "benchmark_prices", "sports_events", "waitlist_signups", "leagues", "league_members", "reactions", "follows"])} RESTART IDENTITY CASCADE`

  const today = new Date().toISOString().slice(0, 10)
  await db.insert(schema.securities).values(
    SECURITIES.map(({ price, move, ...s }) => ({
      ...s,
      closePrice: price.toFixed(4),
      closePriceAsOf: today,
      previousClose: (price / (1 + move / 100)).toFixed(4),
    })),
  )
  const priceOf = new Map(SECURITIES.map((s) => [s.id, s.price]))

  // Daily closes for the comparison ETFs, walked backwards-free from a start price, so "Compare" has data.
  for (const [symbol, cfg] of Object.entries(BENCHMARK_SEEDS)) {
    const random = makeRandom(symbol.charCodeAt(0) * 131 + symbol.length)
    let close = cfg.start
    const rows = []
    for (let i = DAYS; i >= 0; i--) {
      close *= 1 + cfg.drift + (random() - 0.5) * cfg.volatility
      rows.push({ symbol, date: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), close: close.toFixed(6) })
    }
    await db.insert(schema.benchmarkPrices).values(rows)
  }

  const ids: Record<string, string> = {}

  for (const [index, person] of DEMO_PEOPLE.entries()) {
    const random = makeRandom(index * 977 + 42)

    const [user] = await db
      .insert(schema.users)
      .values({
        // Fixed ids, so a reseed doesn't log the browser out into an empty account.
        id: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
        email: `${person.handle}@example.com`,
        name: person.name,
        handle: person.handle,
        image: `/demo/avatars/${person.handle}.png`,
      })
      .returning({ id: schema.users.id })

    const userId = user!.id
    ids[person.handle] = userId
    const mix = MIXES[person.handle]!
    // The walk is scaled so its last day equals what the holdings add up to; otherwise the chart and the accounts disagree.
    const target = sum(mix.brokerage) + sum(mix.retirement)
    // Like a real investor view: investments only, no checking or card.
    const cash = 0
    const liabilities = 0

    const walk: { date: string; invested: number; netFlows: number }[] = []
    let raw = 100
    for (let i = DAYS; i >= 0; i--) {
      raw *= 1 + person.drift + (random() - 0.5) * person.volatility
      // A periodic contribution, so time-weighting has real flows to divide out.
      const netFlows = i % 30 === 0 && i !== DAYS ? 1 : 0
      raw += netFlows
      walk.push({ date: new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10), invested: raw, netFlows })
    }
    const scale = target / walk[walk.length - 1]!.invested
    
    for (const day of walk) {
      const value = day.invested * scale
      const totalAssets = value + cash
      await db.insert(schema.portfolioSnapshots).values({
        userId,
        date: day.date,
        totalAssets: totalAssets.toFixed(4),
        totalLiabilities: liabilities.toFixed(4),
        netWorth: (totalAssets - liabilities).toFixed(4),
        investableAssets: value.toFixed(4),
        netFlows: (day.netFlows * scale).toFixed(4),
        isVerified: true,
      })
    }

    // Three real institutions with their real logos (transparent PNGs, so they sit on the card's dark ring like Plaid's do).
    const [fidelityItem, robinhoodItem, vanguardItem] = await db
      .insert(schema.plaidItems)
      .values(
        [
          ["Fidelity", "/landing/brokerages/fidelity.png", 0],
          ["Robinhood", "/landing/brokerages/robinhood-clean.png", 5 * 3_600_000],
          ["Vanguard", "/landing/brokerages/vanguard-clean.png", 26 * 3_600_000],
        ].map(([institutionName, institutionLogo, ago], i) => ({
          userId,
          plaidItemId: `demo-item-${i + 1}-${person.handle}`,
          // Not a real token; the demo never calls Plaid.
          accessToken: "demo-not-a-real-token",
          institutionName: institutionName as string,
          institutionLogo: institutionLogo as string,
          status: "active" as const,
          lastSyncedAt: new Date(Date.now() - (ago as number)),
        })),
      )
      .returning({ id: schema.plaidItems.id })

    // Spread the positions over four accounts so the card looks like a real multi-broker setup.
    const split = Math.max(1, mix.brokerage.length - 3)
    const robinhoodIndividual = mix.brokerage.slice(0, split)
    const robinhoodRoth = mix.brokerage.slice(split)
    const half = Math.ceil(mix.retirement.length / 2)
    const fidelity401k = mix.retirement.slice(0, half)
    const vanguardIra = mix.retirement.slice(half).length ? mix.retirement.slice(half) : mix.retirement.slice(-1)
    const plan = [
      { item: fidelityItem!, name: "401(k) Plan", mask: "0107", subtype: "401k", positions: fidelity401k },
      { item: robinhoodItem!, name: "Individual", mask: "4597", subtype: "brokerage", positions: robinhoodIndividual },
      { item: robinhoodItem!, name: "Roth IRA", mask: "3965", subtype: "roth", positions: robinhoodRoth },
      { item: vanguardItem!, name: "Rollover IRA", mask: "8820", subtype: "ira", positions: vanguardIra },
    ]
    const created = await db
      .insert(schema.accounts)
      .values(
        plan.map((a, i) => ({
          itemId: a.item.id, userId, source: "plaid" as const, plaidAccountId: `demo-acct-${i + 1}-${person.handle}`,
          name: a.name, mask: a.mask, type: "investment", subtype: a.subtype,
          category: "investment" as const, currentBalance: sum(a.positions).toFixed(4),
        })),
      )
      .returning({ id: schema.accounts.id })

    for (const [i, account] of created.entries()) {
      await db.insert(schema.holdings).values(
        plan[i]!.positions.map(([securityId, value]) => ({
          accountId: account.id,
          userId,
          securityId,
          quantity: (value / priceOf.get(securityId)!).toFixed(4),
          // Gains between about +4% and +58%, different on every position, so no row reads as broken.
          costBasis: (value / (1.04 + random() * 0.54)).toFixed(4),
          institutionValue: value.toFixed(4),
        })),
      )
    }

    console.log(`  ${person.name} — ${DAYS + 1} days of history`)
  }

  await seedSocial(ids)

  console.log("\nDone. Sign in with the developer login as any of:")
  for (const person of DEMO_PEOPLE) console.log(`  ${person.handle}@example.com`)
}

/** A league everyone is in, plus follows, so the social surfaces aren't empty. */
async function seedSocial(ids: Record<string, string>) {
  for (const person of DEMO_PEOPLE) {
    await db
      .update(schema.users)
      .set({ isPublic: true, bio: person.bio })
      .where(eq(schema.users.id, ids[person.handle]!))
  }

  const [league] = await db
    .insert(schema.leagues)
    .values({
      name: "The Group Chat",
      description: "Bragging rights only",
      emoji: "🏆",
      accent: "emerald",
      ownerId: ids.theo!,
      inviteCode: "BCDF2345",
    })
    .returning({ id: schema.leagues.id })

  await db.insert(schema.leagueMembers).values(
    DEMO_PEOPLE.map((person) => ({
      leagueId: league!.id,
      userId: ids[person.handle]!,
      role: person.handle === "theo" ? ("owner" as const) : ("member" as const),
    })),
  )

  await db.insert(schema.reactions).values([
    { leagueId: league!.id, fromUserId: ids.maya!, toUserId: ids.theo!, emoji: "🔥" },
    { leagueId: league!.id, fromUserId: ids.deshawn!, toUserId: ids.theo!, emoji: "👏" },
    { leagueId: league!.id, fromUserId: ids.theo!, toUserId: ids.priya!, emoji: "😤" },
  ])

  await db.insert(schema.follows).values([
    { followerId: ids.theo!, followingId: ids.maya! },
    { followerId: ids.theo!, followingId: ids.priya! },
  ])

  console.log("  League 'The Group Chat' — invite code BCDF2345")
}

main()
  .then(() => sql.end())
  .catch(async (error) => {
    console.error(error)
    await sql.end()
    process.exit(1)
  })
