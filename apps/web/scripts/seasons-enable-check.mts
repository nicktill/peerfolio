/**
 * Regression check for turning seasons on mid-life. Run after `npm run preview:seed`:
 *   tsx --conditions=react-server scripts/seasons-enable-check.mts
 *
 * Takes the seeded "Legacy Stock Race" (an ordinary league with members, positions, trades and
 * snapshots, and no season), fingerprints everything the long race is built from, enables seasons
 * through the real code path, and proves: the fingerprint is identical afterwards, a non-owner is
 * refused, a bad date is refused, enabling twice or five times at once leaves one season, and the
 * league page data, season view, list chip and the engine all still work. It then removes the season
 * it made so the demo league is a legacy league again and the check can be repeated.
 */
import { config } from "dotenv"
import { eq, sql } from "drizzle-orm"

config({ path: ".env.local" })
config({ path: ".env" })

const { db, fantasyLeagues, fantasySeasons, users } = await import("../src/db/index.ts")
const { enableSeasons, advanceLeague, latestSeason } = await import("../src/lib/fantasy-seasons.ts")
const { loadSeasonView, loadRoundChips } = await import("../src/lib/fantasy-season-view.ts")
const { loadFantasyLeague, listFantasyLeaguesForUser } = await import("../src/lib/fantasy.ts")
const { nextPeriodStart } = await import("../src/lib/fantasy-season.ts")

let failures = 0
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? "ok  " : "FAIL"} ${what}`)
  if (!ok) failures++
}
const refused = async (run: () => Promise<unknown>, status: number) => {
  try {
    await run()
    return false
  } catch (error) {
    return (error as { status?: number }).status === status
  }
}

const [league] = await db.select().from(fantasyLeagues).where(eq(fantasyLeagues.name, "Legacy Stock Race"))
if (!league) throw new Error("Legacy Stock Race not found. Run npm run preview:seed first.")
const [other] = await db.select().from(users).where(sql`${users.id} <> ${league.ownerId}`).limit(1)
await db.delete(fantasySeasons).where(eq(fantasySeasons.leagueId, league.id)) // start from a legacy league, whatever the last run left

/** Everything the long race and the trade history are made of, as counts plus a hash of every row. */
async function fingerprint() {
  const q = async (table: string, order: string) => {
    const [row] = await db.execute<{ n: number; h: string }>(
      sql.raw(`SELECT count(*)::int AS n, coalesce(md5(string_agg(t::text, '|' ORDER BY ${order})), '') AS h FROM ${table} t WHERE ${table === "fantasy_leagues" ? "id" : "league_id"} = '${league.id}'`),
    )
    return `${row!.n}:${row!.h}`
  }
  const [snaps] = await db.execute<{ n: number; h: string }>(
    sql.raw(`SELECT count(*)::int AS n, coalesce(md5(string_agg(s::text, '|' ORDER BY s.id)), '') AS h FROM fantasy_snapshots s JOIN fantasy_members m ON m.id = s.member_id WHERE m.league_id = '${league.id}'`),
  )
  const [pos] = await db.execute<{ n: number; h: string }>(
    sql.raw(`SELECT count(*)::int AS n, coalesce(md5(string_agg(p::text, '|' ORDER BY p.id)), '') AS h FROM fantasy_positions p JOIN fantasy_members m ON m.id = p.member_id WHERE m.league_id = '${league.id}'`),
  )
  return { league: await q("fantasy_leagues", "id"), members: await q("fantasy_members", "id"), trades: await q("fantasy_trades", "id"), snapshots: `${snaps!.n}:${snaps!.h}`, positions: `${pos!.n}:${pos!.h}` }
}

const render = async () => {
  const page = await loadFantasyLeague(league.ownerId, league.id, { refresh: false })
  const chips = await loadRoundChips(league.ownerId, [league.id])
  const list = (await listFantasyLeaguesForUser(league.ownerId)).find((l) => l.id === league.id)
  return { page, list, chip: chips.get(league.id) }
}

const before = await fingerprint()
const beforeRender = await render()
check(beforeRender.chip === undefined, "before: no season chip on the list row")
check((await latestSeason(league.id)) === undefined, "before: no season row")
check(((await loadSeasonView(league.ownerId, league.id)) as { none?: boolean }).none === true, "before: season page shows the turn-on screen")

check(await refused(() => enableSeasons(other!.id, league.id, { cadence: "weekly" }), 403), "a member who is not the owner is refused (403)")
check(await refused(() => enableSeasons(league.ownerId, league.id, { cadence: "monthly", startsAt: new Date("2030-01-02T00:00:00Z") }), 400), "a start that is not a boundary is refused (400)")
check(await refused(() => enableSeasons(league.ownerId, league.id, { cadence: "weekly", startsAt: new Date("2020-01-06T00:00:00Z") }), 400), "a start in the past is refused (400)")
check((await latestSeason(league.id)) === undefined, "refusals created nothing")

const start = nextPeriodStart(new Date(), "monthly")
const results = await Promise.all(Array.from({ length: 5 }, () => enableSeasons(league.ownerId, league.id, { cadence: "monthly", startsAt: start, rounds: 6 })))
const seasons = await db.select().from(fantasySeasons).where(eq(fantasySeasons.leagueId, league.id))
check(seasons.length === 1, "five requests at once leave exactly one season")
check(results.filter((r) => r.created).length === 1, "exactly one of them reports created")
check(seasons[0]?.cadence === "monthly" && seasons[0].startsAt.getTime() === start.getTime() && seasons[0].roundCount === 6, "season has the chosen cadence, start and length")
const again = await enableSeasons(league.ownerId, league.id, { cadence: "weekly" })
check(!again.created && again.season.id === seasons[0]!.id && again.season.cadence === "monthly", "enabling again changes nothing and returns the running season")

await advanceLeague(league.id)
await advanceLeague(league.id)
const after = await fingerprint()
for (const key of Object.keys(before) as (keyof typeof before)[]) check(before[key] === after[key], `unchanged: ${key}`)
const rounds = await db.execute<{ n: number }>(sql`SELECT count(*)::int AS n FROM fantasy_rounds WHERE league_id = ${league.id}`)
check(rounds[0]!.n === 0, "no round exists before the start date (nothing scored early)")

const view = (await loadSeasonView(league.ownerId, league.id)) as { season?: { state: string; cadence: string }; none?: boolean }
check(view.season?.state === "upcoming" && view.season.cadence === "monthly", "season page: upcoming, monthly")
const afterRender = await render()
check(JSON.stringify(afterRender.page) === JSON.stringify(beforeRender.page), "league page data is identical")
check(afterRender.chip?.state === "upcoming", "list row: season chip shows")
check(JSON.stringify(afterRender.list) === JSON.stringify(beforeRender.list), "list row standings are identical")

// Second run: weekly, starting this Monday, so round 1 is already running over the league's history.
await db.delete(fantasySeasons).where(eq(fantasySeasons.leagueId, league.id))
const { weekStart } = await import("../src/lib/fantasy-season.ts")
const thisWeek = await enableSeasons(league.ownerId, league.id, { cadence: "weekly", startsAt: weekStart(new Date()) })
await advanceLeague(league.id)
const running = (await loadSeasonView(league.ownerId, league.id)) as { season?: { state: string }; current: { number: number; rows: unknown[] } | null }
check(thisWeek.created && running.season?.state === "running" && running.current?.number === 1, "weekly from this Monday: round 1 is live")
check((running.current?.rows.length ?? 0) > 0, "round 1 ranks the members who were already in the league")
check(JSON.stringify((await fingerprint())) === JSON.stringify(before), "unchanged after a live round, too")

await db.delete(fantasySeasons).where(eq(fantasySeasons.leagueId, league.id))
check((await fingerprint()).trades === before.trades, "cleanup left the league as it was")
console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) failed.`)
process.exit(failures === 0 ? 0 : 1)
