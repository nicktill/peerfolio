import "server-only"
import { summarizeHoldings } from "@web/lib/dashboard-math"
import { readCachedNews } from "@web/lib/news"
import { matchHoldings } from "@web/lib/ai/news-match"
import { buildLeagueStandings, listLeaguesForUser, requireMembership } from "@web/lib/social"
import { shapeStandings } from "@web/lib/ai/league-view"
import { shapeFantasy, type FantasyLeagueLike } from "@web/lib/ai/fantasy-view"
import { loadFantasyLeague } from "@web/lib/fantasy"
import { eq } from "drizzle-orm"
import { db, fantasyLeagues, fantasyMembers } from "@web/db"
import { BENCHMARKS, compareToBenchmark } from "@web/lib/benchmarks"
import { benchmarkCloses } from "@web/lib/benchmark-data"
import { MAX_LEAGUE_OVERVIEW, parseArgs, parseBenchmark, parseLimit, parseRange, planLeagueLookup, readAfterMembership, requestedLeagueId } from "@web/lib/ai/tool-args"
import { loadPositions, loadXRay, trackedWindow } from "@web/lib/ai/portfolio-data"
import type { XRay } from "@web/lib/ai/portfolio-xray"

/**
 * The assistant's tools: read-only, and bound to the signed-in user when they
 * are built. The model supplies arguments (a count at most); it never supplies
 * a user id, so no argument can reach another person's data.
 */

export type ToolContext = {
  userId: string
  /** The league open on the page, when there is one. A hint only: membership is checked before any league data is read. */
  pageLeagueId?: string
  /** The fantasy league open on the page; same rule as `pageLeagueId`. */
  pageFantasyId?: string
  /** Called when a tool produces something the interface should render itself. */
  emit: (event: { type: "xray"; data: XRay }) => void
}

export { TOOL_DEFS, type ToolDef } from "@web/lib/ai/tool-defs"

const round = (v: number | null, places = 2) => (v == null ? null : Math.round(v * 10 ** places) / 10 ** places)

/** A person's X-Ray barely changes in minutes; follow-up questions reuse it instead of recomputing. */
const XRAY_TTL_MS = 3 * 60_000
const xrayCache = new Map<string, { at: number; value: XRay }>()

async function cachedXRay(userId: string): Promise<XRay> {
  const hit = xrayCache.get(userId)
  if (hit && Date.now() - hit.at < XRAY_TTL_MS) return hit.value
  const value = await loadXRay(userId)
  if (xrayCache.size > 500) xrayCache.clear()
  xrayCache.set(userId, { at: Date.now(), value })
  return value
}

export async function runTool(name: string, rawArgs: string, ctx: ToolContext): Promise<unknown> {
  switch (name) {
    case "get_portfolio_xray": {
      const xray = await cachedXRay(ctx.userId)
      ctx.emit({ type: "xray", data: xray })
      return xray
    }
    case "get_holdings": {
      const limit = parseLimit(parseArgs(rawArgs))
      const rows = summarizeHoldings(await loadPositions(ctx.userId)).slice(0, limit)
      return {
        holdings: rows.map((r) => ({
          ticker: r.ticker,
          name: r.name,
          type: r.type,
          value: round(r.value),
          weightPercent: round(r.weight),
          todayPercent: round(r.todayPercent),
          gainPercent: round(r.gainPercent),
          accounts: r.positions,
        })),
      }
    }
    case "get_my_leagues": {
      const rows = await listLeaguesForUser(ctx.userId)
      // Chosen fields only: no invite codes or owner ids.
      return { leagues: rows.map((l) => ({ id: l.id, name: l.name, members: l.memberCount, yourRole: l.role })) }
    }
    case "get_league_standings": {
      const args = parseArgs(rawArgs)
      const range = parseRange(args)
      let leagueId = requestedLeagueId(args, ctx.pageLeagueId)
      if (!leagueId) {
        const mine = await listLeaguesForUser(ctx.userId)
        const plan = planLeagueLookup(mine)
        if (plan.kind === "none") return { reason: "The user isn't in any league." }
        if (plan.kind === "overview") {
          // No league open and several to choose from: a one-line standing in each (database reads only).
          const overview = await Promise.all(
            mine.slice(0, MAX_LEAGUE_OVERVIEW).map(async (l) => {
              const view = shapeStandings(await buildLeagueStandings(l.id, ctx.userId, range))
              return { id: l.id, league: l.name, members: view.members, ranked: view.ranked, you: view.you }
            }),
          )
          return { range, overview, truncated: plan.truncated, note: "Pass a league id for full standings." }
        }
        leagueId = plan.id
      }
      const id = leagueId
      // Throws unless the user is a member, whatever id the model passed; nothing is read before that.
      let name = ""
      const standings = await readAfterMembership(
        async () => {
          name = (await requireMembership(ctx.userId, id)).league.name
        },
        () => buildLeagueStandings(id, ctx.userId, range),
      )
      return { league: name, range, ...shapeStandings(standings) }
    }
    case "get_fantasy_league": {
      let leagueId = requestedLeagueId(parseArgs(rawArgs), ctx.pageFantasyId)
      if (!leagueId) {
        // Names only, from a plain query: the helper that lists fantasy leagues also refreshes prices.
        const mine = await db
          .select({ id: fantasyLeagues.id, name: fantasyLeagues.name })
          .from(fantasyMembers)
          .innerJoin(fantasyLeagues, eq(fantasyMembers.leagueId, fantasyLeagues.id))
          .where(eq(fantasyMembers.userId, ctx.userId))
        const plan = planLeagueLookup(mine)
        if (plan.kind === "none") return { reason: "The user isn't in any fantasy league." }
        if (plan.kind === "overview") {
          // Several leagues and none open: the user's own line in each, from stored prices.
          const overview = await Promise.all(
            mine.slice(0, MAX_LEAGUE_OVERVIEW).map(async (l) => {
              const view = shapeFantasy((await loadFantasyLeague(ctx.userId, l.id, { refresh: false })) as unknown as FantasyLeagueLike)
              return { id: l.id, league: l.name, members: view.standings.length, closed: view.league.closed, you: { rank: view.you.rank, returnPercent: view.you.returnPercent, gapToLeaderPoints: view.you.gapToLeaderPoints } }
            }),
          )
          return { overview, truncated: plan.truncated, pricesNote: "Based on stored prices, not live quotes.", note: "Pass a league id for full detail." }
        }
        leagueId = plan.id
      }
      // Membership is checked inside; refresh:false means no price requests and no order fills.
      const data = await loadFantasyLeague(ctx.userId, leagueId, { refresh: false })
      return shapeFantasy(data as unknown as FantasyLeagueLike)
    }
    case "compare_to_benchmark": {
      const args = parseArgs(rawArgs)
      const symbol = parseBenchmark(args)
      if (!symbol) return { error: "Unknown benchmark. Use SPY, QQQ or VTI." }
      const range = parseRange(args)
      const window = await trackedWindow(ctx.userId, range)
      if (!window || window.series.length < 2) return { reason: "Not enough tracked history for a comparison yet." }
      const result = compareToBenchmark(window.series, await benchmarkCloses(symbol, window.series[0]!.date))
      if (!result.ok) return { reason: result.reason === "starts-late" ? "Benchmark prices don't reach back to the first tracked day." : "Benchmark prices aren't available right now." }
      const c = result.value
      return {
        benchmark: BENCHMARKS.find((b) => b.symbol === symbol)!.label,
        basis: "price return (dividends not included)",
        window: { start: c.startDate, end: c.endDate, range },
        yourReturnPercent: round(c.portfolioPercent),
        benchmarkReturnPercent: round(c.benchmarkPercent),
        differencePoints: round(c.differencePoints),
      }
    }
    case "get_market_news": {
      const [news, positions] = await Promise.all([readCachedNews(), loadPositions(ctx.userId)])
      const held = positions.filter((p) => p.value > 0).map((p) => ({ ticker: p.ticker, name: p.name }))
      const recap = news.day
      return {
        recap: recap
          ? { headline: recap.headline, summary: recap.body.slice(0, 1500), asOf: recap.periodEnd, takeaways: recap.takeaways.slice(0, 5).map((t) => ({ title: t.title, body: t.body.slice(0, 400) })) }
          : null,
        headlines: news.headlines.map((h) => ({
          title: h.title.slice(0, 200),
          source: h.source,
          publishedAt: h.publishedAt,
          mentionsYourHoldings: matchHoldings(h, held),
        })),
      }
    }
    default:
      return { error: `Unknown tool: ${name}` }
  }
}
