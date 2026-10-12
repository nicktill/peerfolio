import "server-only"
import fs from "node:fs"
import path from "node:path"
import { eq, inArray, sql } from "drizzle-orm"
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
import {
  DAYS,
  DEMO_FANTASY_LEAGUES,
  DEMO_PEOPLE,
  FANTASY_START,
  MIXES,
  SECURITIES,
  fantasyDayRange,
  fantasyEndsAt,
  fantasyHistory,
  fantasyIsComplete,
  makeRandom,
  type DemoFantasyLeague,
} from "@web/lib/demo-data"

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
    (MIXES[handle] ?? MIXES.theo!).map(([securityId, value]) => ({
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

const GROUP_CHAT_CODE = "BCDF2345"
const rowsOf = <T>(result: unknown) => (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as T[]

/**
 * One cheap look at what's already there, so a repeat sign-in costs two queries and no writes. Says
 * whether the people, the Group Chat seat and every fantasy league are whole for this user.
 */
async function worldIsComplete(meId: string, extraSeat: boolean) {
  const codes = sql.join(DEMO_FANTASY_LEAGUES.map((l) => sql`${l.inviteCode}`), sql`, `)
  const [basics, fantasy] = await Promise.all([
    db.execute(sql`
      select
        (select count(*)::int from users where email in (${sql.join(DEMO_PEOPLE.map((p) => sql`${`${p.handle}@example.com`}`), sql`, `)})) as people,
        (select count(*)::int from league_members lm join leagues l on l.id = lm.league_id where l.invite_code = ${GROUP_CHAT_CODE}) as members,
        exists (select 1 from league_members lm join leagues l on l.id = lm.league_id where l.invite_code = ${GROUP_CHAT_CODE} and lm.user_id = ${meId}) as mine`),
    db.execute(sql`
      select l.invite_code, l.ends_at,
        (select count(*)::int from fantasy_members where league_id = l.id) as members,
        (select count(*)::int from fantasy_positions p join fantasy_members fm on fm.id = p.member_id where fm.league_id = l.id) as positions,
        (select count(*)::int from fantasy_trades where league_id = l.id) as trades,
        (select count(*)::int from fantasy_snapshots s join fantasy_members fm on fm.id = s.member_id where fm.league_id = l.id) as snapshots,
        exists (select 1 from fantasy_members where league_id = l.id and user_id = ${meId}) as mine
      from fantasy_leagues l where l.invite_code in (${codes})`),
  ])
  const [b] = rowsOf<{ people: number; members: number; mine: boolean }>(basics)
  if (!b || b.people < DEMO_PEOPLE.length || b.members < DEMO_PEOPLE.length || !b.mine) return false
  const rows = rowsOf<{ invite_code: string; ends_at: string | Date | null; members: number; positions: number; trades: number; snapshots: number; mine: boolean }>(fantasy).map((r) => ({
    inviteCode: r.invite_code,
    endsAt: r.ends_at ? new Date(r.ends_at) : null,
    members: r.members,
    positions: r.positions,
    trades: r.trades,
    snapshots: r.snapshots,
    mine: r.mine,
  }))
  return fantasyIsComplete(rows, new Date(), extraSeat)
}

/**
 * The shared world around one signed-in demo user: the other four people, a league, follows and the
 * fantasy leagues. Every step only adds what's missing, so it also repairs a database an earlier build
 * left half-made (or made around different people), and it does nothing once everything's there.
 */
async function ensureDemoWorld(me: { id: string; handle: string | null }) {
  const extraSeat = !DEMO_PEOPLE.some((p) => p.handle === me.handle)
  if (await worldIsComplete(me.id, extraSeat)) return

  const ids: Record<string, string> = {}
  for (const person of DEMO_PEOPLE) {
    const email = `${person.handle}@example.com`
    const user = (await db.query.users.findFirst({ where: eq(users.email, email) })) ?? (await createDemoPerson(email))
    if (user) ids[person.handle] = user.id
  }
  if (!ids.theo || !ids.maya || !ids.deshawn || !ids.priya) return

  // "The Group Chat": everyone, with a few reactions and follows so the social screens aren't bare.
  await db
    .insert(leagues)
    .values({ name: "The Group Chat", description: "Bragging rights only", emoji: "🏆", accent: "emerald", ownerId: ids.theo, inviteCode: GROUP_CHAT_CODE })
    .onConflictDoNothing()
  const leagueId = (await db.query.leagues.findFirst({ where: eq(leagues.inviteCode, GROUP_CHAT_CODE) }))?.id
  if (leagueId) {
    const members = [...Object.entries(ids).map(([handle, userId]) => ({ userId, role: handle === "theo" ? ("owner" as const) : ("member" as const) })), ...(extraSeat ? [{ userId: me.id, role: "member" as const }] : [])]
    await db.insert(leagueMembers).values(members.map((m) => ({ leagueId, ...m }))).onConflictDoNothing()
    await db
      .insert(reactions)
      .values([
        { leagueId, fromUserId: ids.maya, toUserId: ids.theo, emoji: "🔥" },
        { leagueId, fromUserId: ids.deshawn, toUserId: ids.theo, emoji: "👏" },
        { leagueId, fromUserId: ids.theo, toUserId: ids.priya, emoji: "😤" },
      ])
      .onConflictDoNothing()
    await db
      .insert(follows)
      .values([
        { followerId: ids.theo, followingId: ids.maya },
        { followerId: ids.theo, followingId: ids.priya },
      ])
      .onConflictDoNothing()
  }

  for (const league of DEMO_FANTASY_LEAGUES) await ensureDemoFantasyLeague(league, ids, extraSeat ? me.id : null)
}

/**
 * One demo fantasy league with five players at different points in a race, so the standings, race
 * chart, balance cards and trade feed all have something to show. Positions are in the demo
 * securities, which sit at a flat $100, so each player's value is the cash and shares set here.
 *
 * Heals in place: it finds the league by invite code whatever built it, seats anyone missing, and
 * fills in only the history, positions and trades a seat lacks. It never deletes or rewrites a seat
 * that already has them, and every insert is conflict-safe so two sign-ins at once can't collide.
 */
async function ensureDemoFantasyLeague(plan: DemoFantasyLeague, ids: Record<string, string>, extraUserId: string | null) {
  const owner = ids[plan.owner] ?? ids.maya!
  const endsAt = fantasyEndsAt(plan)
  await db
    .insert(fantasyLeagues)
    .values({ name: plan.name, emoji: plan.emoji, accent: plan.accent, ownerId: owner, inviteCode: plan.inviteCode, startingCash: String(FANTASY_START), maxPositionPct: 40, endsAt })
    .onConflictDoNothing()
  const league = await db.query.fantasyLeagues.findFirst({ where: eq(fantasyLeagues.inviteCode, plan.inviteCode) })
  if (!league) return
  // A demo league is for showing a state: running ones stay running, the finished one stays finished.
  const lapsed = plan.endsInDays === null ? league.endsAt !== null : plan.endsInDays < 0 ? league.endsAt === null || league.endsAt.getTime() > Date.now() : league.endsAt === null || league.endsAt.getTime() < Date.now() + 7 * 86_400_000
  if (lapsed) await db.update(fantasyLeagues).set({ endsAt }).where(eq(fantasyLeagues.id, league.id))

  const seats = plan.players.flatMap((p) => (ids[p.handle] ? [{ leagueId: league.id, userId: ids[p.handle]!, cash: p.cash.toFixed(6) }] : []))
  if (extraUserId) seats.push({ leagueId: league.id, userId: extraUserId, cash: "100000.000000" })
  await db.insert(fantasyMembers).values(seats).onConflictDoNothing()

  const members = await db.select({ id: fantasyMembers.id, userId: fantasyMembers.userId }).from(fantasyMembers).where(eq(fantasyMembers.leagueId, league.id))
  const memberIds: Record<string, string> = {}
  const have = (table: typeof fantasySnapshots | typeof fantasyPositions | typeof fantasyTrades) =>
    db.select({ memberId: table.memberId }).from(table).where(inArray(table.memberId, members.map((m) => m.id)))
  const [snapshotRows, positionRows, tradeRows] = await Promise.all([have(fantasySnapshots), have(fantasyPositions), have(fantasyTrades)])
  const seen = (rows: { memberId: string }[]) => new Set(rows.map((r) => r.memberId))
  const [hasSnapshots, hasPositions, hasTrades] = [seen(snapshotRows), seen(positionRows), seen(tradeRows)]
  const { firstDay, lastDay } = fantasyDayRange(plan)

  for (const [index, player] of plan.players.entries()) {
    const userId = ids[player.handle]
    const member = members.find((m) => m.userId === userId)
    if (!member) continue
    memberIds[player.handle] = member.id
    const random = makeRandom(plan.seed * 31 + index)
    const finalValue = FANTASY_START * (1 + player.returnPct / 100)
    const investedTotal = finalValue - player.cash

    const history = fantasyHistory(plan, finalValue, random)
    if (!hasSnapshots.has(member.id)) {
      await db.insert(fantasySnapshots).values(history.map((h) => ({ memberId: member.id, date: isoDay(h.daysAgo), value: h.value.toFixed(6) }))).onConflictDoNothing()
    }
    // Positions and cash have to agree for the value to be right, so a seat that lacked positions is reset to the plan's cash.
    if (!hasPositions.has(member.id)) {
      await db.update(fantasyMembers).set({ cash: player.cash.toFixed(6) }).where(eq(fantasyMembers.id, member.id))
      await db
        .insert(fantasyPositions)
        .values(player.picks.map(([securityId, weight]) => ({ memberId: member.id, securityId, shares: ((investedTotal * weight) / 100).toFixed(8), costBasis: (investedTotal * weight * (0.88 + random() * 0.1)).toFixed(6) })))
        .onConflictDoNothing()
    }
    if (!hasTrades.has(member.id)) {
      await db.insert(fantasyTrades).values(
        player.picks.map(([securityId, weight]) => {
          const daysAgo = lastDay + Math.floor(random() * (firstDay - lastDay + 1))
          return { leagueId: league.id, memberId: member.id, securityId, side: "buy" as const, shares: ((investedTotal * weight) / 100).toFixed(8), price: "100.000000", priceAsOf: isoDay(daysAgo), createdAt: new Date(Date.now() - (daysAgo + random() * 0.9) * 86_400_000) }
        }),
      )
    }
  }

  if (memberIds.maya && memberIds.theo && memberIds.priya && memberIds.deshawn) {
    await db
      .insert(fantasyReactions)
      .values([
        { fromMemberId: memberIds.theo, toMemberId: memberIds.maya, emoji: "🔥" },
        { fromMemberId: memberIds.deshawn, toMemberId: memberIds.maya, emoji: "👏" },
        { fromMemberId: memberIds.maya, toMemberId: memberIds.priya, emoji: "😤" },
      ])
      .onConflictDoNothing()
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
