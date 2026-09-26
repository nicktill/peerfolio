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

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.")
  process.exit(1)
}

const sql = postgres(url, { max: 1, prepare: false })
const db = drizzle(sql, { schema })

/** Deterministic PRNG, so re-seeding produces the same portfolios every time. */
function makeRandom(seed: number) {
  let state = seed
  return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

const DEMO_PEOPLE = [
  { handle: "nick", name: "Nick Tillmann", drift: 0.0016, volatility: 0.01, bio: "Index funds and patience." },
  { handle: "maya", name: "Maya Chen", drift: 0.0024, volatility: 0.014, bio: "Concentrated in what I understand." },
  { handle: "deshawn", name: "DeShawn Ellis", drift: 0.0009, volatility: 0.006, bio: "Boring on purpose." },
  { handle: "priya", name: "Priya Raman", drift: 0.0031, volatility: 0.021, bio: "High conviction, high variance." },
  { handle: "sam", name: "Sam Okafor", drift: 0.0019, volatility: 0.009, bio: "Three funds and a nap." },
]

const SECURITIES = [
  { id: "demo-vti", tickerSymbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf" },
  { id: "demo-vxus", tickerSymbol: "VXUS", name: "Vanguard Total International Stock ETF", type: "etf" },
  { id: "demo-bnd", tickerSymbol: "BND", name: "Vanguard Total Bond Market ETF", type: "fixed_income" },
  { id: "demo-nvda", tickerSymbol: "NVDA", name: "NVIDIA Corporation", type: "equity" },
  { id: "demo-aapl", tickerSymbol: "AAPL", name: "Apple Inc.", type: "equity" },
  { id: "demo-msft", tickerSymbol: "MSFT", name: "Microsoft Corporation", type: "equity" },
]

const MIXES: Record<string, [string, number][]> = {
  nick: [["demo-vti", 21400], ["demo-vxus", 8200], ["demo-bnd", 5100], ["demo-nvda", 4300], ["demo-aapl", 2600]],
  maya: [["demo-nvda", 19800], ["demo-msft", 11200], ["demo-aapl", 7400], ["demo-vti", 5100]],
  deshawn: [["demo-vti", 28000], ["demo-bnd", 14000]],
  priya: [["demo-nvda", 26500], ["demo-aapl", 9100], ["demo-msft", 4200]],
  sam: [["demo-vti", 16000], ["demo-vxus", 9400], ["demo-msft", 6100]],
}

const DAYS = 120

async function main() {
  console.log("Clearing existing data…")
  await sql`TRUNCATE ${sql(["users", "plaid_items", "accounts", "securities", "holdings", "portfolio_snapshots", "waitlist_signups", "leagues", "league_members", "reactions", "follows"])} RESTART IDENTITY CASCADE`

  await db.insert(schema.securities).values(SECURITIES.map((s) => ({ ...s, closePrice: "100" })))

  const ids: Record<string, string> = {}

  for (const [index, person] of DEMO_PEOPLE.entries()) {
    const random = makeRandom(index * 977 + 42)

    const [user] = await db
      .insert(schema.users)
      .values({
        email: `${person.handle}@example.com`,
        name: person.name,
        handle: person.handle,
      })
      .returning({ id: schema.users.id })

    const userId = user!.id
    ids[person.handle] = userId
    let invested = 18000 + random() * 40000
    const cash = 4200 + random() * 3000
    const liabilities = 2100

    for (let i = DAYS; i >= 0; i--) {
      const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
      invested *= 1 + person.drift + (random() - 0.5) * person.volatility

      // A periodic contribution, so time-weighting has real flows to divide out.
      const netFlows = i % 30 === 0 && i !== DAYS ? 500 : 0
      invested += netFlows

      const totalAssets = invested + cash

      await db.insert(schema.portfolioSnapshots).values({
        userId,
        date,
        totalAssets: totalAssets.toFixed(4),
        totalLiabilities: liabilities.toFixed(4),
        netWorth: (totalAssets - liabilities).toFixed(4),
        investableAssets: invested.toFixed(4),
        netFlows: netFlows.toFixed(4),
        isVerified: true,
      })
    }

    const [item] = await db
      .insert(schema.plaidItems)
      .values({
        userId,
        plaidItemId: `demo-item-${person.handle}`,
        // Not a real token; the demo never calls Plaid.
        accessToken: "demo-not-a-real-token",
        institutionName: person.handle === "nick" ? "Charles Schwab" : "Fidelity",
        status: "active",
        lastSyncedAt: new Date(),
      })
      .returning({ id: schema.plaidItems.id })

    const [brokerage] = await db
      .insert(schema.accounts)
      .values([
        {
          itemId: item!.id, userId, source: "plaid", plaidAccountId: `demo-inv-${person.handle}`,
          name: "Brokerage", mask: "4471", type: "investment", subtype: "brokerage",
          category: "investment", currentBalance: invested.toFixed(4),
        },
        {
          itemId: item!.id, userId, source: "plaid", plaidAccountId: `demo-cash-${person.handle}`,
          name: "Checking", mask: "0092", type: "depository", subtype: "checking",
          category: "cash", currentBalance: cash.toFixed(4),
        },
        {
          itemId: item!.id, userId, source: "plaid", plaidAccountId: `demo-cc-${person.handle}`,
          name: "Credit Card", mask: "1188", type: "credit", subtype: "credit card",
          category: "credit", currentBalance: liabilities.toFixed(4),
        },
      ])
      .returning({ id: schema.accounts.id })

    await db.insert(schema.holdings).values(
      MIXES[person.handle]!.map(([securityId, value]) => ({
        accountId: brokerage!.id,
        userId,
        securityId,
        quantity: (value / 100).toFixed(4),
        costBasis: (value * 0.82).toFixed(4),
        institutionValue: value.toFixed(4),
      })),
    )

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
      ownerId: ids.nick!,
      inviteCode: "BCDF2345",
    })
    .returning({ id: schema.leagues.id })

  await db.insert(schema.leagueMembers).values(
    DEMO_PEOPLE.map((person) => ({
      leagueId: league!.id,
      userId: ids[person.handle]!,
      role: person.handle === "nick" ? ("owner" as const) : ("member" as const),
    })),
  )

  await db.insert(schema.reactions).values([
    { leagueId: league!.id, fromUserId: ids.maya!, toUserId: ids.nick!, emoji: "🔥" },
    { leagueId: league!.id, fromUserId: ids.deshawn!, toUserId: ids.nick!, emoji: "👏" },
    { leagueId: league!.id, fromUserId: ids.nick!, toUserId: ids.priya!, emoji: "😤" },
  ])

  await db.insert(schema.follows).values([
    { followerId: ids.nick!, followingId: ids.maya! },
    { followerId: ids.nick!, followingId: ids.priya! },
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
