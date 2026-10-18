/**
 * Static sample data for the "See it with sample data" views. Invented people and numbers, never read from
 * or written to the database. `sampleResponse` is what `useApi` consults first, so the real league and
 * board screens render these fixtures unchanged; `isSampleUrl` is what `mutate` uses to refuse writes.
 */

import { demoPortfolio } from "@web/lib/portfolio-demo"
import { applyCashout, applyParlayCashout, applyPick, applyTrade, sampleCashoutQuote, sampleParlayCashoutQuote, fantasyView, sportsView } from "@web/lib/sample/store"
import { getDemoMode } from "@web/lib/sample/demo-mode"
import { parlayQuote } from "@web/lib/sports/parlay-math"
import fantasyData from "@web/lib/sample/data/fantasy.json"
import seasonData from "@web/lib/sample/data/season.json"
import sportsData from "@web/lib/sample/data/sports.json"
import { DEMO_PEOPLE, MIXES, SECURITIES, makeRandom } from "@web/lib/demo-data"


const PERCENT: Record<string, number> = { maya: 18.4, you: 12.7, priya: 9.2, theo: 12.7, deshawn: 2.1, sam: -1.6 }
const NAMES = Object.fromEntries(DEMO_PEOPLE.map((p) => [p.handle, p.name]))
// The league's "you" is the demo's Theo; the board lists him under his own name.
const PEOPLE = ["maya", "you", "priya", "deshawn", "sam"].map((handle) => ({ handle, name: handle === "you" ? "You" : NAMES[handle]!, percent: PERCENT[handle]! }))

/** A gently rising line that ends on `percent`, with a little wobble so each person's isn't a ruler. */
const spark = (percent: number, seed: number) =>
  Array.from({ length: 24 }, (_, i) => {
    const t = i / 23
    return +(100 + percent * t + Math.sin(i * 0.9 + seed) * 1.4 * (1 - t)).toFixed(2)
  })

const holdings = (tickers: [string, number][]) => tickers.map(([ticker, weight]) => ({ ticker, name: null, weight }))

/** Brokerage positions from the shared demo mixes as weights, biggest first. */
const tickerOf = new Map(SECURITIES.map((x) => [x.id, x.tickerSymbol]))
const weightsFor = (handle: string): [string, number][] => {
  const mix = MIXES[handle === "you" ? "theo" : handle]!.brokerage
  const total = mix.reduce((sum, [, value]) => sum + value, 0)
  return mix.map(([id, value]) => [tickerOf.get(id)!, +((value / total) * 100).toFixed(1)] as [string, number])
}
const HOLDINGS_BY_HANDLE = Object.fromEntries(["maya", "you", "priya", "theo", "deshawn", "sam"].map((h) => [h, weightsFor(h)])) as Record<string, [string, number][]>

export const SAMPLE_LEAGUE_ID = "sample"

const standings = PEOPLE.map((p, i) => ({
  userId: `sample-${p.handle}`,
  name: p.name,
  handle: p.handle === "you" ? null : p.handle,
  image: p.handle === "you" ? null : `/demo/avatars/${p.handle}.png`,
  rank: i + 1,
  percent: p.percent,
  days: 31,
  spark: spark(p.percent, i),
  hasHistory: true,
  shareHoldings: true,
  isVerified: false,
  holdings: holdings(HOLDINGS_BY_HANDLE[p.handle]!),
  reactions: i === 0 ? { "🔥": 3, "👀": 1 } : i === 1 ? { "🚀": 2 } : {},
  isYou: p.handle === "you",
  value: Math.round(100_000 * (1 + p.percent / 100)),
}))

/** Snapshots of the demo leagues as the real API returns them, with dates stored as offsets from "now". */
const revive = <T,>(value: T): T => {
  const now = Date.now()
  return JSON.parse(JSON.stringify(value), (_k, v) => (typeof v === "string" && v.startsWith("@@") ? new Date(now + Number(v.slice(2))).toISOString() : v)) as T
}
const FANTASY_LEAGUE = revive(fantasyData)
const SPORTS_LEAGUE = revive(sportsData)
for (const person of SPORTS_LEAGUE.standings) {
  const handle = person.isYou ? "maya" : DEMO_PEOPLE.find((p) => p.name === person.name)?.handle
  Object.assign(person, { image: handle ? `/demo/avatars/${handle}.png` : null })
}
const SEASON = revive(seasonData)

/** Sample parlays for review only: built from the sample markets, never submitted (writes to /parlays are refused in sample views). */
function sampleParlay(id: string, picks: [number, string, "open" | "won" | "lost" | "push"][], stake: number, status: "open" | "won" | "lost", name?: string) {
  const legs = picks.map(([i, selection, legStatus]) => {
    const market = SPORTS_LEAGUE.markets[i]!
    const line = market.lines.find((l) => l.selection === selection)!
    return { lineId: line.id, selection, price: line.price, point: line.point, status: legStatus, market: { kind: market.kind, player: null }, event: { sport: market.event.sport, home: market.event.home, away: market.event.away, startsAt: market.event.startsAt } }
  })
  const quote = parlayQuote(legs.filter((l) => l.status !== "push").map((l) => l.price), stake)!
  return { id, stake, price: quote.american, totalReturn: quote.totalReturn, payout: status === "won" ? quote.totalReturn : status === "lost" ? 0 : null, status, acceptedAt: new Date(Date.now() - 3 * 3600_000).toISOString(), legs, ...(name ? { name } : {}) }
}
Object.assign(SPORTS_LEAGUE, {
  limits: { ...SPORTS_LEAGUE.limits, parlay: { minLegs: 2, maxLegs: 6, minStake: 10, maxStake: 100 } },
  parlays: [sampleParlay("sample-parlay-1", [[0, "away", "open"], [1, "home", "open"], [11, "away", "open"]], 20, "open"), sampleParlay("sample-parlay-2", [[5, "home", "won"], [7, "under", "push"], [9, "away", "won"]], 25, "won")],
  leagueParlays: [sampleParlay("sample-parlay-3", [[0, "home", "lost"], [2, "away", "won"]], 30, "lost", "Marcus Bell")],
})

const BOARD = {
  traders: ["maya", "priya", "theo", "deshawn", "sam"]
    .map((handle) => ({ handle, name: NAMES[handle]!, percent: PERCENT[handle]! }))
    .sort((x, y) => y.percent - x.percent)
    .map((p, i) => ({
      handle: p.handle,
      name: p.name,
      image: `/demo/avatars/${p.handle}.png`,
      bio: null,
      rank: i + 1,
      percent: p.percent,
      days: 90 - i * 9,
      spark: spark(p.percent, i + 3),
      holdings: holdings(HOLDINGS_BY_HANDLE[p.handle]!),
      isFollowing: i === 1,
      isYou: false,
    })),
  minHistoryDays: 7,
  scope: "all" as const,
}

const PRIVATE_LEAGUE = {
  league: { id: SAMPLE_LEAGUE_ID, name: "Brunch club", description: "Five friends, one scoreboard.", emoji: "crest:circle:rocket:shimmer:none", inviteCode: "SAMPLE", isOwner: false },
  you: { shareHoldings: true },
  standings,
}

/** Five-minute steps across today's session, wandering to the sample portfolio's move for the day. */
function intradayFixture() {
  const today = demoPortfolio("1M").today
  const target = today?.amount ?? 0
  const day = today?.asOf ?? new Date().toISOString().slice(0, 10)
  const random = makeRandom(5)
  const open = Date.parse(`${day}T13:30:00Z`)
  const steps = 78
  const points = Array.from({ length: steps }, (_, i) => {
    const progress = (i + 1) / steps
    const noise = i === steps - 1 ? 0 : (random() - 0.5) * Math.abs(target || 200) * 0.18 * (1 - progress)
    return { t: new Date(open + (i + 1) * 300_000).toISOString(), delta: +(target * progress + noise).toFixed(2) }
  })
  return { session: day, points }
}


/** The sample views live under a `/sample` path segment; the board and list screens only serve fixtures there. */
export const inSampleView = (pathname: string) => pathname.split("/").includes("sample")

/** True for any API url that addresses the sample league itself, so writes can be refused whatever the page. */
export const isSampleUrl = (url: string) => /\/api\/(fantasy|leagues|sports\/leagues)\/sample(\/|\?|$)/.test(url)

/** True when requests are being answered by fixtures: on a sample view, or with the local switch off Real. */
export const sampleActive = () => typeof window !== "undefined" && (inSampleView(window.location.pathname) || getDemoMode() !== "real")

const EMPTY_PORTFOLIO = { summary: { totalAssets: 0, totalLiabilities: 0, netWorth: 0, investableAssets: 0 }, accounts: [], items: [], allocation: [], holdings: [], today: null, allTime: null, leagues: [], history: [], performance: { percent: 0, days: 0, range: "1M", series: [] }, hasHistory: false, firstDate: null, isVerified: false }

/** The switch's answers for the list screens, outside a sample view. */
function modeResponse(url: string, mode: "empty" | "sample"): unknown {
  const empty = mode === "empty"
  const path = url.split("?")[0]!
  switch (path) {
    case "/api/portfolio":
      return empty ? EMPTY_PORTFOLIO : null
    case "/api/board":
      return empty ? { traders: [], minHistoryDays: 7, scope: "all" } : BOARD
    case "/api/fantasy":
      return { leagues: empty ? [] : [{ id: SAMPLE_LEAGUE_ID, name: FANTASY_LEAGUE.league.name, emoji: FANTASY_LEAGUE.league.emoji, accent: FANTASY_LEAGUE.league.accent, endsAt: FANTASY_LEAGUE.league.endsAt, isClosed: false, memberCount: FANTASY_LEAGUE.standings.length, yourReturn: FANTASY_LEAGUE.you.percent, yourRank: FANTASY_LEAGUE.you.rank, round: null }] }
    case "/api/sports/leagues":
      return { leagues: empty ? [] : [{ id: SAMPLE_LEAGUE_ID, name: SPORTS_LEAGUE.league.name, emoji: SPORTS_LEAGUE.league.emoji, accent: SPORTS_LEAGUE.league.accent, sports: SPORTS_LEAGUE.league.sports, endsAt: SPORTS_LEAGUE.league.endsAt, isClosed: false, memberCount: SPORTS_LEAGUE.standings.length, credits: SPORTS_LEAGUE.you.credits, startingCredits: SPORTS_LEAGUE.league.startingCredits }] }
    case "/api/leagues":
      return { leagues: empty ? [] : [{ id: SAMPLE_LEAGUE_ID, name: PRIVATE_LEAGUE.league.name, description: PRIVATE_LEAGUE.league.description, emoji: PRIVATE_LEAGUE.league.emoji, accent: "emerald", inviteCode: "SAMPLE", role: "member", memberCount: 5 }] }
    default:
      return null
  }
}

/** Handles shown in sample views. The photo assets stay keyed by the original handles, so only the `handle` field is renamed. */
const DISPLAY_HANDLES: Record<string, string> = { maya: "alexmoreno", theo: "natedelaney", priya: "tessnavarro", deshawn: "marcusbell", sam: "jamiemercer" }
const withDisplayHandles = <T,>(value: T): T =>
  JSON.parse(JSON.stringify(value), (k, v) => (k === "handle" && typeof v === "string" ? (DISPLAY_HANDLES[v] ?? v) : v)) as T

/** The fixture for `url`, or null to let the request go to the network as usual. */
export function sampleResponse(url: string, pathname: string | null): unknown {
  const response = sampleResponseRaw(url, pathname)
  return response === null ? null : withDisplayHandles(response)
}

/** The sample live game's price drifts every ~7s so the ticket's live re-pricing can be seen. */
function sampleLiveProb() { return +(0.46 + (((Math.floor(Date.now() / 7000) * 3) % 5) - 2) * 0.012).toFixed(4) }

function sampleResponseRaw(url: string, pathname: string | null): unknown {
  // Browser-only live ticket preview. The sample slip disables confirmation and never posts an order.
  if (sampleActive() && url === "/api/sports/live/00000000-0000-4000-8000-000000000001") {
    const at = new Date().toISOString()
    return { eventId: "00000000-0000-4000-8000-000000000001", status: "live", score: { home: 10, away: 14 }, period: "3", clock: "8:42", stateAsOf: at, stateFreshness: "live", serverTime: at, odds: { status: "ok", homeProb: sampleLiveProb(), awayProb: +(1 - sampleLiveProb()).toFixed(4), drawProb: null, source: "polymarket", asOf: at, ageMs: 0, freshness: "live", confidence: "high", mismatch: null } }
  }
  if (sampleActive() && url.startsWith("/api/sports/scoreboard?")) {
    const unique = [...new Map(SPORTS_LEAGUE.markets.map(m => [JSON.stringify(m.event), m.event])).values()]
    return { games: [
      ...unique.map((event,i) => ({ ...event, id: `sample-score-${i}`, status: i === 0 ? "unavailable" : "upcoming", statusName: i === 0 ? "STATUS_POSTPONED" : undefined, homeRecord: null, awayRecord: null, homeScore: null, awayScore: null, detail: "Sample game", fetchedAt: new Date().toISOString() })),
      { id: "sample-live", sport: "nfl", home: "Minnesota Vikings", away: "Green Bay Packers", startsAt: new Date(Date.now() - 75 * 60_000).toISOString(), homeRecord: "4-1", awayRecord: "3-2", homeScore: "10", awayScore: "14", status: "live", detail: "Q3 · 08:42 · Sample game", period: 3, clock: "8:42", statusName: "STATUS_IN_PROGRESS", fetchedAt: new Date().toISOString(), homeWinProb: 0.46, awayWinProb: 0.54, probSource: "espn" },
      { id: "sample-live-nba", sport: "nba", home: "Boston Celtics", away: "New York Knicks", startsAt: new Date(Date.now() - 100 * 60_000).toISOString(), homeRecord: null, awayRecord: null, homeScore: "98", awayScore: "95", status: "live", detail: "Q4 2:31", period: 4, clock: "2:31", statusName: "STATUS_IN_PROGRESS", fetchedAt: new Date(Date.now() - 20_000).toISOString() },
      { id: "sample-live-nhl", sport: "nhl", home: "Colorado Avalanche", away: "Dallas Stars", startsAt: new Date(Date.now() - 50 * 60_000).toISOString(), homeRecord: null, awayRecord: null, homeScore: "2", awayScore: "2", status: "live", detail: "End of 1st Period", period: 1, clock: "0:00", statusName: "STATUS_END_PERIOD", fetchedAt: new Date().toISOString() },
      { id: "sample-live-mlb", sport: "mlb", home: "Los Angeles Dodgers", away: "San Diego Padres", startsAt: new Date(Date.now() - 120 * 60_000).toISOString(), homeRecord: null, awayRecord: null, homeScore: "3", awayScore: "1", status: "live", detail: "Top 7th", period: 7, clock: "0:00", statusName: "STATUS_IN_PROGRESS", fetchedAt: new Date(Date.now() - 40_000).toISOString() },
      { id: "sample-live-mls", sport: "mls", home: "Seattle Sounders FC", away: "LA Galaxy", startsAt: new Date(Date.now() - 80 * 60_000).toISOString(), homeRecord: null, awayRecord: null, homeScore: "1", awayScore: "1", status: "live", detail: "72'", period: 2, clock: "72:10", statusName: "STATUS_SECOND_HALF", fetchedAt: new Date().toISOString() },
    ], failedSports: [] }
  }
  if (/^\/api\/fantasy\/sample\/season(\?|$)/.test(url)) return SEASON
  if (/^\/api\/fantasy\/sample(\?|$)/.test(url)) return fantasyView(FANTASY_LEAGUE)
  if (/^\/api\/sports\/live\/history\?/.test(url)) return { points: Array.from({ length: 40 }, (_, i) => +(0.5 + 0.1 * Math.sin(i / 5) - i * 0.002 + (i > 28 ? (i - 28) * 0.012 : 0)).toFixed(3)) }
  if (/^\/api\/sports\/leagues\/sample(\?|$)/.test(url)) return { ...sportsView(SPORTS_LEAGUE), liveEvents: [{ id: "00000000-0000-4000-8000-000000000001", sport: "nfl", home: "Minnesota Vikings", away: "Green Bay Packers", startsAt: new Date(Date.now() - 75 * 60_000).toISOString() }] }
  if (/^\/api\/leagues\/sample(\?|$)/.test(url)) return PRIVATE_LEAGUE
  const quote = url.match(/^\/api\/sports\/leagues\/sample\/picks\/([^/]+)\/cashout$/)
  if (quote) return sampleCashoutQuote(SPORTS_LEAGUE as never, quote[1]!)
  const parlayQuote = url.match(/^\/api\/sports\/leagues\/sample\/parlays\/([^/]+)\/cashout$/)
  if (parlayQuote) return sampleParlayCashoutQuote(SPORTS_LEAGUE as never, parlayQuote[1]!)
  if (/^\/api\/sports\/leagues\/sample\/report/.test(url)) return { pairs: [] }
  if (pathname && inSampleView(pathname) && url === "/api/portfolio/intraday") return intradayFixture()
  if (pathname && inSampleView(pathname) && /^\/api\/board(\?|$)/.test(url)) return BOARD
  const mode = getDemoMode()
  if (mode !== "real" && !(pathname && inSampleView(pathname))) return modeResponse(url, mode)
  return null
}

/** What a write does in a sample view: trades and picks change the sample's own state, everything else is refused. */
export function sampleMutate(url: string, body: unknown): unknown {
  const b = (body ?? {}) as Record<string, unknown>
  if (/^\/api\/fantasy\/sample\/trade$/.test(url)) return applyTrade(FANTASY_LEAGUE, b as Parameters<typeof applyTrade>[1])
  const sale = url.match(/^\/api\/sports\/leagues\/sample\/picks\/([^/]+)\/cashout$/)
  if (sale) return applyCashout(SPORTS_LEAGUE as never, sale[1]!, Number(b.expectedValue))
  const parlaySale = url.match(/^\/api\/sports\/leagues\/sample\/parlays\/([^/]+)\/cashout$/)
  if (parlaySale) return applyParlayCashout(SPORTS_LEAGUE as never, parlaySale[1]!, Number(b.expectedValue))
  if (/^\/api\/sports\/leagues\/sample\/picks$/.test(url)) return applyPick(SPORTS_LEAGUE as never, b as { lineId: string; stake: number })
  throw new Error("This is sample data, so that isn't available here.")
}
