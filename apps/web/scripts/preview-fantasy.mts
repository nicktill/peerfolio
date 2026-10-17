/**
 * Fantasy half of `npm run preview:seed`. Run after `db:seed` (it needs the demo users).
 *
 * Builds three leagues out of nothing but inserts, then lets the real season engine do the scoring:
 *
 *   Legacy Stock Race   an ordinary Fantasy stock league that never turned weekly rounds on (no season row)
 *   Friday Fund         weekly trading rounds: four settled rounds, one running, with trade notes
 *   Sunday Draft Club   weekly draft: three settled rounds (one decided by the tie-break), one locked and
 *                       running, one open for picks
 *
 * Prices are a seeded random walk, written into `securities` as the latest "final" close, so nothing here
 * needs a market-data key or the network. Settlement, results, trophies and recap links come from
 * `advanceLeague`, the same code the app and the nightly job run.
 *
 * Needs the react-server condition because the season engine imports "server-only":
 *   tsx --conditions=react-server scripts/preview-fantasy.mts
 */
import { config } from "dotenv"
import { eq, inArray } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../src/db/schema.ts"
import { DEMO_PEOPLE, makeRandom } from "../src/lib/demo-data.ts"
import { DAY_MS, WEEK_MS, dateKey, roundWindow, weekStart } from "../src/lib/fantasy-season.ts"

config({ path: ".env.local" })
config({ path: ".env" })

const url = process.env.DATABASE_URL
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.preview.example to .env.local first.")
  process.exit(1)
}
const sql = postgres(url, { max: 1, prepare: false })
const db = drizzle(sql, { schema })

const now = new Date()
const MONDAY = weekStart(now)
const handles = DEMO_PEOPLE.map((p) => p.handle) // theo, maya, deshawn, priya, sam

/* ---------------------------------------------------------------- prices */

const BASE: Record<string, [string, number]> = {
  AAPL: ["Apple Inc.", 230],
  MSFT: ["Microsoft Corporation", 450],
  NVDA: ["NVIDIA Corporation", 140],
  GOOGL: ["Alphabet Inc.", 175],
  AMZN: ["Amazon.com, Inc.", 200],
  META: ["Meta Platforms, Inc.", 560],
  TSLA: ["Tesla, Inc.", 250],
  JPM: ["JPMorgan Chase & Co.", 220],
  KO: ["The Coca-Cola Company", 65],
  DIS: ["The Walt Disney Company", 100],
}
const TICKERS = Object.keys(BASE)
const idOf = (ticker: string) => `mkt:${ticker}`

const isWeekday = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6
const startOfDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
const TODAY = startOfDay(now)
/** The latest session that has closed: the most recent weekday before today. */
let LAST = new Date(TODAY.getTime() - DAY_MS)
while (!isWeekday(LAST)) LAST = new Date(LAST.getTime() - DAY_MS)

const paths = new Map<string, Map<string, number>>()
for (const [i, ticker] of TICKERS.entries()) {
  const rand = makeRandom(1000 + i * 31)
  const series = new Map<string, number>()
  let price = BASE[ticker]![1] * 0.93
  for (let back = 90; back >= 0; back--) {
    const day = new Date(TODAY.getTime() - back * DAY_MS)
    if (!isWeekday(day)) continue
    price *= 1 + 0.0007 + (rand() - 0.5) * 0.034
    series.set(dateKey(day), Math.round(price * 100) / 100)
  }
  paths.set(ticker, series)
}
/** Close on a date, carried forward over weekends. */
function closeOn(ticker: string, key: string): number {
  const series = paths.get(ticker)!
  let day = new Date(`${key}T00:00:00Z`)
  for (let i = 0; i < 10; i++) {
    const hit = series.get(dateKey(day))
    if (hit !== undefined) return hit
    day = new Date(day.getTime() - DAY_MS)
  }
  throw new Error(`no price for ${ticker} on ${key}`)
}
const round2 = (v: number) => Math.round(v * 100) / 100

/* -------------------------------------------------------------- simulation */

type Sim = {
  trades: { at: Date; side: "buy" | "sell"; ticker: string; shares: number; price: number; asOf: string }[]
  positions: Map<string, { shares: number; cost: number }>
  cash: number
  snapshots: { date: string; value: number }[]
}

/** One member's trade history, positions, cash and nightly values, all from the price paths. */
function simulate(seed: number, startingCash: number, tradeTimes: Date[]): Sim {
  const rand = makeRandom(seed)
  const times = tradeTimes.filter((t) => t.getTime() <= now.getTime())
  const trades: Sim["trades"] = []
  const positions = new Map<string, { shares: number; cost: number }>()
  let cash = startingCash
  const buy = (at: Date, ticker: string, dollars: number) => {
    const asOf = dateKey(at)
    const price = closeOn(ticker, asOf)
    const shares = Math.floor((dollars / price) * 1e8) / 1e8
    const value = shares * price
    cash -= value
    const held = positions.get(ticker) ?? { shares: 0, cost: 0 }
    positions.set(ticker, { shares: held.shares + shares, cost: held.cost + value })
    trades.push({ at, side: "buy", ticker, shares, price, asOf })
  }
  const sellAll = (at: Date, ticker: string): number => {
    const held = positions.get(ticker)!
    const asOf = dateKey(at)
    const price = closeOn(ticker, asOf)
    const value = held.shares * price
    cash += value
    positions.delete(ticker)
    trades.push({ at, side: "sell", ticker, shares: held.shares, price, asOf })
    return value
  }
  const pick = (exclude: Set<string>) => {
    const pool = TICKERS.filter((t) => !exclude.has(t))
    return pool[Math.floor(rand() * pool.length)]!
  }

  times.forEach((at, i) => {
    if (i === 0) {
      const chosen = new Set<string>()
      const spend = startingCash * (0.7 + rand() * 0.25)
      for (let k = 0; k < 3; k++) {
        const t = pick(chosen)
        chosen.add(t)
        buy(at, t, spend / 3)
      }
      return
    }
    // A swap: sell one holding, put the proceeds into something not held.
    const held = [...positions.keys()]
    const out = held[Math.floor(rand() * held.length)]!
    const proceeds = sellAll(at, out)
    buy(at, pick(new Set([...positions.keys(), out])), proceeds)
  })

  // Nightly values from the first trade to the last session, as the nightly job would have written them.
  const snapshots: Sim["snapshots"] = []
  if (times.length > 0) {
    for (let day = startOfDay(times[0]!); day.getTime() <= LAST.getTime(); day = new Date(day.getTime() + DAY_MS)) {
      const key = dateKey(day)
      const end = day.getTime() + DAY_MS
      let c = startingCash
      const p = new Map<string, number>()
      for (const t of trades) {
        if (t.at.getTime() >= end) break
        const v = t.shares * t.price
        c += t.side === "buy" ? -v : v
        p.set(t.ticker, (p.get(t.ticker) ?? 0) + (t.side === "buy" ? t.shares : -t.shares))
      }
      let total = c
      for (const [ticker, shares] of p) if (shares > 1e-9) total += shares * closeOn(ticker, key)
      snapshots.push({ date: key, value: round2(total) })
    }
  }
  return { trades, positions, cash, snapshots }
}

/* ------------------------------------------------------------------ setup */

const userRows = await db.select().from(schema.users).where(inArray(schema.users.email, handles.map((h) => `${h}@example.com`)))
const userId: Record<string, string> = {}
for (const u of userRows) userId[u.handle ?? ""] = u.id
if (handles.some((h) => !userId[h])) {
  console.error("The demo users are missing. Run `npm run db:seed` first.")
  await sql.end()
  process.exit(1)
}

// Friends: a web of follows so the social surfaces have people in them (db:seed adds only two).
const FRIENDS: [string, string][] = [
  ["maya", "theo"], ["maya", "priya"], ["maya", "sam"], ["maya", "deshawn"],
  ["theo", "maya"], ["priya", "maya"], ["sam", "maya"], ["deshawn", "maya"],
  ["theo", "sam"], ["sam", "theo"], ["priya", "deshawn"],
]
await db.insert(schema.follows).values(FRIENDS.map(([a, b]) => ({ followerId: userId[a]!, followingId: userId[b]! }))).onConflictDoNothing()

await db
  .insert(schema.securities)
  .values(
    TICKERS.map((ticker) => {
      const previous = (() => {
        let d = new Date(LAST.getTime() - DAY_MS)
        while (!isWeekday(d)) d = new Date(d.getTime() - DAY_MS)
        return closeOn(ticker, dateKey(d))
      })()
      return {
        id: idOf(ticker),
        tickerSymbol: ticker,
        name: BASE[ticker]![0],
        type: "equity",
        marketTicker: ticker,
        closePrice: closeOn(ticker, dateKey(LAST)).toFixed(2),
        previousClose: previous.toFixed(2),
        closePriceAsOf: dateKey(LAST),
        closePriceFinal: true,
      }
    }),
  )
  .onConflictDoNothing()

const at = (monday: Date, plusDays: number, hour = 15) => new Date(monday.getTime() + plusDays * DAY_MS + hour * 3_600_000)

async function createLeague(opts: { name: string; emoji: string; accent: string; code: string; owner: string; createdAt: Date; cash: number; endsAt?: Date | null; cap?: number | null }) {
  const [league] = await db
    .insert(schema.fantasyLeagues)
    .values({
      name: opts.name,
      emoji: opts.emoji,
      accent: opts.accent,
      ownerId: userId[opts.owner]!,
      inviteCode: opts.code,
      startingCash: opts.cash.toString(),
      maxPositionPct: opts.cap ?? null,
      endsAt: opts.endsAt ?? null,
      createdAt: opts.createdAt,
    })
    .returning()
  return league!
}

type Seat = { memberId: string; handle: string; sim: Sim }

/** Seats the five demo players in a league with trading histories, positions, cash and nightly values. */
async function seatTraders(leagueId: string, startingCash: number, tradeTimes: Date[], seed: number): Promise<Seat[]> {
  const seats: Seat[] = []
  for (const [i, handle] of handles.entries()) {
    const sim = simulate(seed + i * 17, startingCash, tradeTimes)
    const joinedAt = new Date(tradeTimes[0]!.getTime() - 3_600_000)
    const [member] = await db
      .insert(schema.fantasyMembers)
      .values({ leagueId, userId: userId[handle]!, cash: sim.cash.toFixed(6), joinedAt })
      .returning()
    const memberId = member!.id
    if (sim.trades.length > 0) {
      await db.insert(schema.fantasyTrades).values(
        sim.trades.map((t) => ({
          leagueId,
          memberId,
          securityId: idOf(t.ticker),
          side: t.side,
          shares: t.shares.toFixed(8),
          price: t.price.toFixed(6),
          priceAsOf: t.asOf,
          createdAt: t.at,
        })),
      )
    }
    const held = [...sim.positions].filter(([, p]) => p.shares > 1e-9)
    if (held.length > 0) {
      await db.insert(schema.fantasyPositions).values(held.map(([ticker, p]) => ({ memberId, securityId: idOf(ticker), shares: p.shares.toFixed(8), costBasis: p.cost.toFixed(6) })))
    }
    if (sim.snapshots.length > 0) {
      await db.insert(schema.fantasySnapshots).values(sim.snapshots.map((s) => ({ memberId, date: s.date, value: s.value.toFixed(6) })))
    }
    seats.push({ memberId, handle, sim })
  }
  return seats
}

/* --------------------------------------------- 1. legacy league (no season) */

const legacyStart = at(new Date(MONDAY.getTime() - 2 * WEEK_MS), 2) // a Wednesday two weeks back
const legacyTimes = [0, 1, 2].map((k) => new Date(legacyStart.getTime() + k * WEEK_MS))
const legacy = await createLeague({
  name: "Legacy Stock Race",
  emoji: "📈",
  accent: "sky",
  code: "LGCY2345",
  owner: "maya",
  createdAt: new Date(legacyStart.getTime() - DAY_MS),
  cash: 100_000,
  endsAt: new Date(TODAY.getTime() + 40 * DAY_MS),
  cap: 25,
})
await seatTraders(legacy.id, 100_000, legacyTimes, 7)

/* ------------------------------------------- 2. weekly trading rounds league */

const SEASON_WEEKS = 4
const tradingStart = new Date(MONDAY.getTime() - SEASON_WEEKS * WEEK_MS)
const tradingTimes = [at(tradingStart, -5), ...Array.from({ length: SEASON_WEEKS + 1 }, (_, k) => at(tradingStart, k * 7 + 2))]
const fund = await createLeague({
  name: "Friday Fund",
  emoji: "🏆",
  accent: "emerald",
  code: "WKLY2345",
  owner: "maya",
  createdAt: new Date(tradingStart.getTime() - 6 * DAY_MS),
  cash: 100_000,
})
const fundSeats = await seatTraders(fund.id, 100_000, tradingTimes, 101)
await db.insert(schema.fantasySeasons).values({ leagueId: fund.id, number: 1, mode: "trading", roundCount: null, picksPerRound: null, startsAt: tradingStart })

// "Why I bought it" notes with replies and reactions on a few trades.
const NOTES: { handle: string; ticker?: string; body: string; replies: [string, string][]; reactions: [string, string][] }[] = [
  { handle: "priya", body: "Rotating into the winner. High conviction, high variance, as always.", replies: [["maya", "Bold. I'm fading you this week."], ["theo", "Respect the process."]], reactions: [["maya", "🔥"], ["sam", "😤"]] },
  { handle: "maya", body: "Cutting the laggard before earnings. Will not miss it.", replies: [["deshawn", "Boring would have held."]], reactions: [["theo", "👏"]] },
  { handle: "sam", body: "Three funds and a nap, but this week I swapped one.", replies: [], reactions: [["priya", "🔥"]] },
]
for (const note of NOTES) {
  const seat = fundSeats.find((s) => s.handle === note.handle)!
  const rows = await db.select().from(schema.fantasyTrades).where(eq(schema.fantasyTrades.memberId, seat.memberId))
  const recent = rows.filter((r) => r.side === "buy").sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0]
  if (!recent) continue
  const [row] = await db.insert(schema.fantasyNotes).values({ leagueId: fund.id, memberId: seat.memberId, tradeId: recent.id, body: note.body }).returning()
  for (const [who, body] of note.replies) {
    await db.insert(schema.fantasyNoteReplies).values({ noteId: row!.id, memberId: fundSeats.find((s) => s.handle === who)!.memberId, body })
  }
  for (const [who, emoji] of note.reactions) {
    await db.insert(schema.fantasyNoteReactions).values({ noteId: row!.id, memberId: fundSeats.find((s) => s.handle === who)!.memberId, emoji }).onConflictDoNothing()
  }
}

/* ------------------------------------------------------ 3. weekly draft league */

const DRAFT_ROUNDS_DONE = 3
const draftStart = new Date(MONDAY.getTime() - DRAFT_ROUNDS_DONE * WEEK_MS)
const draft = await createLeague({
  name: "Sunday Draft Club",
  emoji: "🎯",
  accent: "violet",
  code: "DRFT2345",
  owner: "maya",
  createdAt: new Date(draftStart.getTime() - 6 * DAY_MS),
  cash: 100_000,
})
const draftSeats: Seat[] = []
for (const handle of handles) {
  const [member] = await db
    .insert(schema.fantasyMembers)
    .values({ leagueId: draft.id, userId: userId[handle]!, cash: "100000", joinedAt: new Date(draftStart.getTime() - 3 * DAY_MS) })
    .returning()
  draftSeats.push({ memberId: member!.id, handle, sim: simulate(0, 100_000, []) })
}
const [season] = await db
  .insert(schema.fantasySeasons)
  .values({ leagueId: draft.id, number: 1, mode: "draft", roundCount: null, picksPerRound: 5, startsAt: draftStart })
  .returning()

const rounds: { number: number; id: string; startsAt: Date; endsAt: Date }[] = []
for (let number = 1; number <= DRAFT_ROUNDS_DONE + 2; number++) {
  const w = roundWindow(draftStart, number)
  const [row] = await db
    .insert(schema.fantasyRounds)
    .values({ seasonId: season!.id, leagueId: draft.id, number, ...w, status: number <= DRAFT_ROUNDS_DONE + 1 ? "locked" : "open" })
    .returning()
  rounds.push({ number, id: row!.id, ...w })
}
const friday = (d: Date) => dateKey(new Date(d.getTime() - 3 * DAY_MS)) // a Monday 00:00 minus three days
const seatOf = (h: string) => draftSeats.find((s) => s.handle === h)!

// Round 2 is built to be level on the average and decided on the worst pick (the tie-break):
// priya and sam both average +4.0%, but priya's worst pick is 0.0% and sam's is -2.0%.
const TIE: Record<number, Record<string, number[]>> = { 2: { priya: [10, 10, 0, 0, 0], sam: [8, 6, 4, 4, -2] } }

type PickInsert = typeof schema.fantasyDraftPicks.$inferInsert
const pickRows: PickInsert[] = []
const pickKeys: { handle: string; round: number; ticker: string; slot: number }[] = []
for (const round of rounds) {
  const rand = makeRandom(500 + round.number * 13)
  for (const seat of draftSeats) {
    // Round 5 is open for picks. Maya has saved three of five, one player has not picked yet.
    if (round.number === DRAFT_ROUNDS_DONE + 2 && seat.handle === "sam") continue
    const slots = round.number === DRAFT_ROUNDS_DONE + 2 && seat.handle === "maya" ? 3 : 5
    const pool = [...TICKERS]
    const chosen: string[] = []
    for (let k = 0; k < slots; k++) chosen.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]!)
    chosen.forEach((ticker, i) => {
      const slot = i + 1
      const row: PickInsert = { roundId: round.id, memberId: seat.memberId, securityId: idOf(ticker), slot }
      if (round.number <= DRAFT_ROUNDS_DONE + 1) {
        const entryKey = friday(round.startsAt)
        const entry = closeOn(ticker, entryKey)
        row.entryPrice = entry.toFixed(6)
        row.entryAsOf = entryKey
        if (round.number <= DRAFT_ROUNDS_DONE) {
          const exitKey = friday(round.endsAt)
          const target = TIE[round.number]?.[seat.handle]?.[i]
          const exit = target === undefined ? closeOn(ticker, exitKey) : round2(entry * (1 + target / 100))
          row.exitPrice = exit.toFixed(6)
          row.exitAsOf = exitKey
        }
      }
      pickRows.push(row)
      pickKeys.push({ handle: seat.handle, round: round.number, ticker, slot })
    })
  }
}
const insertedPicks = await db.insert(schema.fantasyDraftPicks).values(pickRows).returning()
const pickIdFor = (handle: string, round: number, slot: number) => {
  const key = pickKeys.find((k) => k.handle === handle && k.round === round && k.slot === slot)
  if (!key) return undefined
  const r = rounds.find((x) => x.number === round)!
  return insertedPicks.find((p) => p.roundId === r.id && p.memberId === seatOf(handle).memberId && p.slot === slot)?.id
}

// "Why I picked it" notes (the one visible before the lock is the player's own) with a reply and reactions.
const PICK_NOTES: { handle: string; round: number; slot: number; body: string; replies: [string, string][]; reactions: [string, string][] }[] = [
  { handle: "priya", round: 3, slot: 1, body: "Earnings beat, momentum, and nobody is talking about it.", replies: [["maya", "Nobody except you."]], reactions: [["theo", "🔥"], ["sam", "😤"]] },
  { handle: "sam", round: 2, slot: 1, body: "Safe pick to stay near the top. I like boring.", replies: [], reactions: [["deshawn", "👏"]] },
  { handle: "theo", round: 3, slot: 2, body: "Patient money. A dull name that keeps paying.", replies: [["deshawn", "Same energy."]], reactions: [] },
  { handle: "maya", round: 5, slot: 1, body: "Locking this in early for next week. Conviction pick.", replies: [], reactions: [] },
  { handle: "theo", round: 5, slot: 1, body: "Next week's swing: I think the market is wrong on this one.", replies: [["priya", "We'll see Monday."]], reactions: [["maya", "🔥"]] },
]
for (const note of PICK_NOTES) {
  const pickId = pickIdFor(note.handle, note.round, note.slot)
  if (!pickId) continue
  const [row] = await db.insert(schema.fantasyNotes).values({ leagueId: draft.id, memberId: seatOf(note.handle).memberId, pickId, body: note.body }).returning()
  for (const [who, body] of note.replies) await db.insert(schema.fantasyNoteReplies).values({ noteId: row!.id, memberId: seatOf(who).memberId, body })
  for (const [who, emoji] of note.reactions) await db.insert(schema.fantasyNoteReactions).values({ noteId: row!.id, memberId: seatOf(who).memberId, emoji }).onConflictDoNothing()
}

/* ------------------------------------------------- settle with the real engine */

const { advanceLeague } = await import("../src/lib/fantasy-seasons.ts")
await advanceLeague(fund.id, new Date())
await advanceLeague(draft.id, new Date())
// Weekly drafts are not offered in the app any more; the seeded draft league is removed again so the preview shows only what ships.
await sql`DELETE FROM fantasy_leagues WHERE id = ${draft.id}`

const recaps = await sql<{ league: string; round: number; token: string }[]>`
  SELECT l.name AS league, r.number AS round, rc.share_token AS token
  FROM fantasy_recaps rc
  JOIN fantasy_rounds r ON r.id = rc.round_id
  JOIN fantasy_leagues l ON l.id = rc.league_id
  ORDER BY l.name, r.number`
const settled = await sql<{ league: string; settled: number; total: number }[]>`
  SELECT l.name AS league, count(*) FILTER (WHERE r.status = 'settled')::int AS settled, count(*)::int AS total
  FROM fantasy_rounds r JOIN fantasy_leagues l ON l.id = r.league_id GROUP BY l.name ORDER BY l.name`
const trophies = await sql<{ n: number }[]>`SELECT count(*)::int AS n FROM fantasy_trophies`

console.log("Fantasy leagues:")
console.log(`  Legacy Stock Race   no season, invite ${legacy.inviteCode}   /fantasy/${legacy.id}`)
console.log(`  Friday Fund         trading rounds, invite ${fund.inviteCode}   /fantasy/${fund.id}/season`)
for (const s of settled) console.log(`  rounds settled in ${s.league}: ${s.settled} of ${s.total}`)
console.log(`  trophies awarded: ${trophies[0]?.n ?? 0}`)
console.log("Public recap links (no sign-in needed):")
for (const r of recaps) console.log(`  ${r.league}, round ${r.round}: /recap/${r.token}`)

await sql.end()
// The season engine keeps its own connection pool open; this script is finished.
process.exit(0)
