import "server-only"
import fs from "node:fs"
import path from "node:path"
import { eq, sql } from "drizzle-orm"
import { migrate } from "drizzle-orm/postgres-js/migrator"
import {
  db,
  accounts,
  fantasyLeagues,
  fantasyMembers,
  fantasyPositions,
  fantasyReactions,
  fantasySnapshots,
  fantasyTrades,
  follows,
  holdings,
  leagueMembers,
  leagues,
  plaidItems,
  portfolioSnapshots,
  reactions,
  securities,
  users,
} from "@web/db"
import { DAYS, DEMO_FANTASY, DEMO_PEOPLE, MIXES, SECURITIES, makeRandom } from "@web/lib/demo-data"

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
  // Where the files land depends on how the host lays out a monorepo, so look in the likely places.
  const cwd = process.cwd()
  const roots = [cwd, path.join(cwd, "apps/web"), path.join(cwd, ".."), path.join(cwd, "../apps/web"), path.join(cwd, "../..")]
  const folder = roots.map((root) => path.join(root, "drizzle")).find((dir) => fs.existsSync(path.join(dir, "meta/_journal.json")))
  if (!folder) throw new Error(`Migration files aren't in this build (looked from ${cwd})`)
  await migrate(db, { migrationsFolder: folder })
}

const isoDay = (daysAgo: number) => new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10)

/** One demo person: the user row, a few months of portfolio history, an account and holdings. */
async function createDemoPerson(email: string) {
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
  // Lost a race with another request creating the same person.
  if (!created) return db.query.users.findFirst({ where: eq(users.email, email) })

  const userId = created.id
  let invested = 18000 + random() * 40000
  const cash = 4200 + random() * 3000
  const liabilities = 2100

  const rows = []
  for (let i = DAYS; i >= 0; i--) {
    invested *= 1 + person.drift + (random() - 0.5) * person.volatility
    const netFlows = i % 30 === 0 && i !== DAYS ? 500 : 0
    invested += netFlows
    const totalAssets = invested + cash
    rows.push({
      userId,
      date: isoDay(i),
      totalAssets: totalAssets.toFixed(4),
      totalLiabilities: liabilities.toFixed(4),
      netWorth: (totalAssets - liabilities).toFixed(4),
      investableAssets: invested.toFixed(4),
      netFlows: netFlows.toFixed(4),
      isVerified: true,
    })
  }
  await db.insert(portfolioSnapshots).values(rows)

  await db
    .insert(securities)
    .values(SECURITIES.map((s) => ({ ...s, closePrice: "100", closePriceAsOf: isoDay(0) })))
    .onConflictDoUpdate({ target: securities.id, set: { closePrice: sql`excluded.close_price`, closePriceAsOf: sql`excluded.close_price_as_of` } })

  const [item] = await db
    .insert(plaidItems)
    .values({ userId, plaidItemId: `demo-item-${handle}`, accessToken: "demo-not-a-real-token", institutionName: "Fidelity", status: "active", lastSyncedAt: new Date() })
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

  return created
}

/** The shared world around one signed-in demo user: the other four people, a league, follows and a fantasy league. */
async function ensureDemoWorld(me: { id: string; handle: string | null }) {
  const ids: Record<string, string> = {}
  for (const person of DEMO_PEOPLE) {
    const email = `${person.handle}@example.com`
    const user = (await db.query.users.findFirst({ where: eq(users.email, email) })) ?? (await createDemoPerson(email))
    if (user) ids[person.handle] = user.id
  }
  if (!ids.nick || !ids.maya) return

  // "The Group Chat": everyone, with a few reactions and follows so the social screens aren't bare.
  const [league] = await db
    .insert(leagues)
    .values({ name: "The Group Chat", description: "Bragging rights only", emoji: "🏆", accent: "emerald", ownerId: ids.nick, inviteCode: "BCDF2345" })
    .onConflictDoNothing()
    .returning({ id: leagues.id })
  const leagueId = league?.id ?? (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, "BCDF2345") }))?.id
  if (leagueId) {
    const members = [...Object.entries(ids).map(([handle, userId]) => ({ userId, role: handle === "nick" ? ("owner" as const) : ("member" as const) })), ...(Object.values(ids).includes(me.id) ? [] : [{ userId: me.id, role: "member" as const }])]
    await db.insert(leagueMembers).values(members.map((m) => ({ leagueId, ...m }))).onConflictDoNothing()
    if (league) {
      await db.insert(reactions).values([
        { leagueId, fromUserId: ids.maya, toUserId: ids.nick, emoji: "🔥" },
        { leagueId, fromUserId: ids.deshawn!, toUserId: ids.nick, emoji: "👏" },
        { leagueId, fromUserId: ids.nick, toUserId: ids.priya!, emoji: "😤" },
      ]).onConflictDoNothing()
      await db.insert(follows).values([
        { followerId: ids.nick, followingId: ids.maya },
        { followerId: ids.nick, followingId: ids.priya! },
      ]).onConflictDoNothing()
    }
  }

  await ensureDemoFantasyLeague(ids, me.id)
}

/**
 * "Friday Draft": a fantasy league with five players at different points in a 45-day race, so the
 * standings, race chart, balance cards and trade feed all have something to show. Positions are in the
 * demo securities, which sit at a flat $100, so each player's value is the cash and shares set here.
 */
async function ensureDemoFantasyLeague(ids: Record<string, string>, meId: string) {
  const inviteCode = "DEMO2345"
  if (await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.inviteCode, inviteCode) })) return

  const [league] = await db
    .insert(fantasyLeagues)
    .values({ name: "Friday Draft", emoji: "🏈", accent: "emerald", ownerId: ids.maya!, inviteCode, startingCash: "100000", maxPositionPct: 40, endsAt: new Date(Date.now() + 59 * 86_400_000) })
    .onConflictDoNothing()
    .returning({ id: fantasyLeagues.id })
  if (!league) return // another request is building it

  const random = makeRandom(7)
  const memberIds: Record<string, string> = {}
  const start = 100_000
  for (const plan of DEMO_FANTASY) {
    const userId = ids[plan.handle]
    if (!userId) continue
    const finalValue = start * (1 + plan.returnPct / 100)
    const investedTotal = finalValue - plan.cash

    const [member] = await db
      .insert(fantasyMembers)
      .values({ leagueId: league.id, userId, cash: plan.cash.toFixed(6) })
      .returning({ id: fantasyMembers.id })
    memberIds[plan.handle] = member!.id

    // A 45-day path that wanders and ends on the target, so the race chart has a story.
    const snapshots = []
    for (let day = 45; day >= 1; day--) {
      const progress = (45 - day) / 44
      const wobble = (random() - 0.5) * 0.012 * start * (1 - progress * 0.6)
      snapshots.push({ memberId: member!.id, date: isoDay(day), value: (start + (finalValue - start) * Math.pow(progress, 1.15) + wobble).toFixed(6) })
    }
    await db.insert(fantasySnapshots).values(snapshots)

    for (const [securityId, weight] of plan.picks) {
      const amount = investedTotal * weight
      const shares = amount / 100
      await db.insert(fantasyPositions).values({ memberId: member!.id, securityId, shares: shares.toFixed(8), costBasis: (amount * (0.88 + random() * 0.1)).toFixed(6) })
      await db.insert(fantasyTrades).values({
        leagueId: league.id,
        memberId: member!.id,
        securityId,
        side: "buy",
        shares: shares.toFixed(8),
        price: "100.000000",
        priceAsOf: isoDay(1 + Math.floor(random() * 30)),
        createdAt: new Date(Date.now() - (1 + random() * 30) * 86_400_000),
      })
    }
  }

  if (memberIds.maya && memberIds.nick && memberIds.priya && memberIds.deshawn) {
    await db
      .insert(fantasyReactions)
      .values([
        { fromMemberId: memberIds.nick, toMemberId: memberIds.maya, emoji: "🔥" },
        { fromMemberId: memberIds.deshawn, toMemberId: memberIds.maya, emoji: "👏" },
        { fromMemberId: memberIds.maya, toMemberId: memberIds.priya, emoji: "😤" },
      ])
      .onConflictDoNothing()
  }

  // A signed-in user who isn't one of the five still gets a seat, with the starting stack.
  if (!Object.values(ids).includes(meId)) {
    await db.insert(fantasyMembers).values({ leagueId: league.id, userId: meId, cash: "100000.000000" }).onConflictDoNothing()
  }
}

/**
 * Finds or builds one demo user for the preview developer login, with the whole demo world around
 * them (other players, a league, a fantasy league), so a fresh demo database is usable without
 * running the seed script.
 *
 * Unlike `scripts/seed.ts` it never truncates anything: it only adds rows that are missing.
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
  const user = existing ?? (await createDemoPerson(email))
  if (!user) return user
  // Idempotent, so a demo user created before the fantasy league existed gets it on the next sign-in.
  await ensureDemoWorld(user)
  return user
}
