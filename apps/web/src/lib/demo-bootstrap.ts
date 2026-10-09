import "server-only"
import fs from "node:fs"
import path from "node:path"
import { eq } from "drizzle-orm"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import { db, accounts, holdings, leagueMembers, leagues, plaidItems, portfolioSnapshots, securities, users } from "@web/db"
import { DAYS, DEMO_PEOPLE, MIXES, SECURITIES, makeRandom } from "@web/lib/demo-data"

/** Postgres error code, wherever the driver or drizzle nested it. */
function pgCode(error: unknown): string | undefined {
  for (let e = error as { code?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.code === "string" && /^[0-9A-Z]{5}$/.test(e.code)) return e.code
  }
  return undefined
}

/** The deepest message in an error chain: drizzle's own wrapper only repeats the SQL. */
export function rootMessage(error: unknown): string {
  let message = error instanceof Error ? error.message : "unknown error"
  for (let e = (error as { cause?: unknown } | undefined)?.cause as { message?: string; cause?: unknown } | undefined; e; e = e.cause as typeof e) {
    if (typeof e.message === "string") message = e.message
  }
  return message
}

// 42P01: a table is missing. 42703: a column is missing, so the schema is older than this build.
const SCHEMA_BEHIND = new Set(["42P01", "42703"])

/**
 * Brings a demo database's schema up to this build by applying pending migrations. Only runs when
 * `DEV_LOGIN_DEMO_DATABASE=true`, the owner's statement that this database is disposable demo data,
 * so a preview can never migrate a database nobody marked that way.
 */
async function applyMigrations() {
  if (process.env.DEV_LOGIN_DEMO_DATABASE !== "true") {
    throw new Error("The demo database's schema is out of date and DEV_LOGIN_DEMO_DATABASE isn't set to let a preview upgrade it")
  }
  const folder = [path.join(process.cwd(), "drizzle"), path.join(process.cwd(), "apps/web/drizzle")].find((dir) => fs.existsSync(dir))
  if (!folder) throw new Error("Migration files aren't in this build")
  await migrate(db, { migrationsFolder: folder })
}

/**
 * Creates one demo user, with a few months of history, an account and a league, if the
 * email isn't in the database yet. Used only by the preview developer login, so a fresh demo
 * database is usable without running the seed script.
 *
 * Unlike `scripts/seed.ts` it never truncates anything: it only adds rows for the account being
 * signed into, so it can't wipe data that is already there.
 */
export async function ensureDemoUser(email: string) {
  const lookup = () => db.query.users.findFirst({ where: eq(users.email, email) })
  let existing
  try {
    existing = await lookup()
  } catch (error) {
    const code = pgCode(error)
    if (!code || !SCHEMA_BEHIND.has(code)) throw error
    await applyMigrations()
    existing = await lookup()
  }
  if (existing) return existing

  const local = email.split("@")[0] ?? "demo"
  const handle = local.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 20) || "demo"
  const index = Math.max(0, DEMO_PEOPLE.findIndex((p) => p.handle === handle))
  const person = DEMO_PEOPLE[index]!
  const known = DEMO_PEOPLE.some((p) => p.handle === handle)
  const random = makeRandom(index * 977 + 42)

  const [created] = await db
    .insert(users)
    .values({ email, name: known ? person.name : handle, handle, isPublic: true, bio: known ? person.bio : null })
    .onConflictDoNothing()
    .returning()
  // Lost a race with another request creating the same demo user.
  if (!created) return db.query.users.findFirst({ where: eq(users.email, email) })

  const userId = created.id
  let invested = 18000 + random() * 40000
  const cash = 4200 + random() * 3000
  const liabilities = 2100

  const rows = []
  for (let i = DAYS; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)
    invested *= 1 + person.drift + (random() - 0.5) * person.volatility
    const netFlows = i % 30 === 0 && i !== DAYS ? 500 : 0
    invested += netFlows
    const totalAssets = invested + cash
    rows.push({
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
  await db.insert(portfolioSnapshots).values(rows)

  await db.insert(securities).values(SECURITIES.map((s) => ({ ...s, closePrice: "100" }))).onConflictDoNothing()

  const [item] = await db
    .insert(plaidItems)
    .values({
      userId,
      plaidItemId: `demo-item-${handle}`,
      accessToken: "demo-not-a-real-token",
      institutionName: "Fidelity",
      status: "active",
      lastSyncedAt: new Date(),
    })
    .returning({ id: plaidItems.id })

  const [brokerage] = await db
    .insert(accounts)
    .values([
      { itemId: item!.id, userId, source: "plaid", plaidAccountId: `demo-inv-${handle}`, name: "Brokerage", mask: "4471", type: "investment", subtype: "brokerage", category: "investment", currentBalance: invested.toFixed(4) },
      { itemId: item!.id, userId, source: "plaid", plaidAccountId: `demo-cash-${handle}`, name: "Checking", mask: "0092", type: "depository", subtype: "checking", category: "cash", currentBalance: cash.toFixed(4) },
      { itemId: item!.id, userId, source: "plaid", plaidAccountId: `demo-cc-${handle}`, name: "Credit Card", mask: "1188", type: "credit", subtype: "credit card", category: "credit", currentBalance: liabilities.toFixed(4) },
    ])
    .returning({ id: accounts.id })

  await db.insert(holdings).values(
    (MIXES[handle] ?? MIXES.nick!).map(([securityId, value]) => ({
      accountId: brokerage!.id,
      userId,
      securityId,
      quantity: (value / 100).toFixed(4),
      costBasis: (value * (0.6 + random() * 0.45)).toFixed(4),
      institutionValue: value.toFixed(4),
    })),
  )

  const [league] = await db
    .insert(leagues)
    .values({
      name: "The Group Chat",
      description: "Bragging rights only",
      emoji: "🏆",
      accent: "emerald",
      ownerId: userId,
      inviteCode: Array.from({ length: 8 }, () => "BCDFGHJKMNPQRSTVWXZ23456789"[Math.floor(Math.random() * 27)]).join(""),
    })
    .returning({ id: leagues.id })
  await db.insert(leagueMembers).values({ leagueId: league!.id, userId, role: "owner" })

  return created
}
