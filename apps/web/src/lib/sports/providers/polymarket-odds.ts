import { matchGame, sameTeam, type Candidate } from "../live/match.ts"
import { normalizeQuote, pairProbability } from "../live/quote.ts"
import { CLOB, date, gammaGamesUrl, GAMMA_PAGE, json, KALSHI, KALSHI_SERIES, kalshiQuotes, num, parseClobBook, parseKalshiEvents, POLYMARKET_SERIES, type KalshiGame } from "../live/sources.ts"
import { rawAmerican } from "../odds.ts"
import { REPRICE } from "../reprice-config.ts"
import { booksFromQuotes, exchangeThreeWay, type LegQuote, type ThreeWayBooks } from "../threeway-exchange.ts"
import { isSoccer, type BookQuote, type EventResult, type OddsProvider, type OddsSnapshot, type ProviderEvent, type ProviderMarket, type Sport } from "../types.ts"
import { EspnResultsProvider } from "./espn.ts"

/**
 * Exchange-first odds: lines come from Polymarket (public Gamma + CLOB, no key), Kalshi is a cross-check, and ESPN (free)
 * supplies the schedule, the names and the event id. This is the free replacement for the metered Odds API.
 *
 *  - The event we publish is the ESPN game (id, full names, home/away, start), so settlement matches it by its own id and
 *    home/away never depends on an exchange's title order. A Polymarket game that does not match exactly one ESPN game is
 *    not published.
 *  - Candidate markets come from Gamma (moneyline, spreads, totals; MLS spreads/totals live in the "-more-markets" event).
 *    Prices are NEVER taken from Gamma: the chosen markets' CLOB books are read and run through the same gates as the
 *    repricer (REPRICE: spread, resting size, book timestamp, outside-range) before a mid is used. A market that fails any
 *    gate, or whose game has no such market, is simply absent from the snapshot ("hidden"); the publisher then does not
 *    publish it, and freezes one it already published (absence from a complete snapshot).
 *  - One line per kind: of the listed spread/total lines, the one whose probability is nearest 50% that passes the gates.
 *  - Kalshi moneyline mid disagreeing with Polymarket by more than REPRICE.disagree hides the moneyline.
 *  - Quotes are one "book" (polymarket) carrying the mid as a fair price, so the publish config must use minBooks 1
 *    (EXCHANGE_PUBLISH in lines.ts). The 2% house margin and round-against-the-player are applied by the normal pricing.
 *  - Free-tier hygiene: per-sport daily request cap, retry with backoff on 429/5xx, a cooldown after a final failure, and
 *    the caller caches snapshots (withSnapshotCache).
 */

export const EXCHANGE_ODDS = {
  /** Most upstream requests (ESPN, Gamma, CLOB, Kalshi) spent on one sport per UTC day. */
  callsPerSportPerDay: 400,
  /** Gamma pages of GAMMA_PAGE (25) events each, up to 400 events (an MLS game alone is up to 8 events). Truncation marks the snapshot incomplete. */
  maxPages: 16,
  /** Books per CLOB request. */
  clobChunk: 100,
  retries: 2,
  backoffMs: 400,
  /** After a request that still failed with 429/5xx, ask that host nothing for this long. */
  cooldownMs: 60_000,
  /** Gamma events are listed this far past the publish window so a start-time shift does not drop a game. */
  windowSlackMs: 6 * 3_600_000,
  /** Gamma-level preselection only (the real gates run on CLOB books). */
  minLiquidity: 500,
  coarseSpread: 0.1,
  /** A spread/total line is only offered while its probability is within 0.5 +- this. */
  mainLineBand: 0.25,
  /** Candidate lines per kind whose books are fetched (the first that passes the gates is used). */
  candidatesPerKind: 2,
  /** A Gamma market not updated for this long is not trusted. */
  maxUpdateAgeMs: 12 * 3_600_000,
} as const

/* ---------------- Gamma ---------------- */

export type PmMarket = {
  type: "moneyline" | "spreads" | "totals"
  question: string
  groupTitle: string
  outcomes: string[]
  tokens: string[]
  /** Token of the "Yes" outcome when the market is a Yes/No one (soccer's per-team and draw markets); null otherwise. */
  yesToken: string | null
  line: number | null
  /** Gamma's own best bid/ask of the first outcome: preselection only, never a price. */
  bid: number | null
  ask: number | null
  liquidity: number | null
  acceptingOrders: boolean
  updatedAt: Date | null
}

export type PmGameGroup = {
  /** Slug of the main event (ends with a date); the "-more-markets" event is folded in. */
  slug: string
  title: string
  startsAt: Date | null
  live: boolean
  ended: boolean
  markets: PmMarket[]
}

const SLUG = /^(.*-\d{4}-\d{2}-\d{2})(-more-markets)?$/
const KINDS = new Set(["moneyline", "spreads", "totals"])

/**
 * Groups a Gamma `events` page into games. Only plain game events and their "-more-markets" companion count; halftime,
 * exact-score, corners, props and other sub-events are ignored, as is every market type except moneyline/spreads/totals.
 * A spread whose question does not repeat its own line, or any market that is not a two-outcome market, is dropped.
 */
export function parseGammaGroups(payload: unknown): PmGameGroup[] {
  if (!Array.isArray(payload)) return []
  const groups = new Map<string, PmGameGroup>()
  const mains = new Set<string>()
  for (const ev of payload as Record<string, unknown>[]) {
    const m = SLUG.exec(String(ev.slug ?? ""))
    if (!m) continue
    const base = m[1]!
    const g = groups.get(base) ?? { slug: base, title: "", startsAt: null, live: false, ended: false, markets: [] }
    if (!m[2]) {
      mains.add(base)
      g.title = String(ev.title ?? "")
      g.startsAt = date(ev.startTime)
      g.live = ev.live === true
      g.ended = ev.ended === true
    }
    for (const raw of Array.isArray(ev.markets) ? (ev.markets as Record<string, unknown>[]) : []) {
      const type = String(raw.sportsMarketType ?? "")
      if (!KINDS.has(type)) continue
      const outcomes = json<string[]>(raw.outcomes)
      const tokens = json<string[]>(raw.clobTokenIds)
      if (!outcomes || !tokens || outcomes.length !== 2 || tokens.length !== 2) continue
      const line = num(raw.line)
      const question = String(raw.question ?? "")
      if (type !== "moneyline") {
        if (line == null) continue
        if (type === "spreads") {
          const quoted = /\(([+-]?\d+(?:\.\d+)?)\)\s*$/.exec(question)
          if (!quoted || Number(quoted[1]) !== line) continue
        }
      }
      g.markets.push({
        type: type as PmMarket["type"],
        question,
        groupTitle: String(raw.groupItemTitle ?? ""),
        outcomes: outcomes.map(String),
        tokens: tokens.map(String),
        yesToken: outcomes.some((o) => /^no$/i.test(String(o).trim())) && outcomes.some((o) => /^yes$/i.test(String(o).trim())) ? String(tokens[outcomes.findIndex((o) => /^yes$/i.test(String(o).trim()))]) : null,
        line,
        bid: num(raw.bestBid),
        ask: num(raw.bestAsk),
        liquidity: num(raw.liquidityNum),
        acceptingOrders: raw.acceptingOrders !== false,
        updatedAt: date(raw.updatedAt),
      })
    }
    groups.set(base, g)
  }
  return [...groups.values()].filter((g) => mains.has(g.slug))
}

const isYesNo = (m: PmMarket) => m.outcomes.some((o) => /^(yes|no)$/i.test(o.trim()))

/** Soccer: the two team markets (in listing order) and the draw market, each a Yes/No market with a YES token. Null unless exactly that. */
export function threeWayOf(g: PmGameGroup): { teams: [PmMarket, PmMarket]; draw: PmMarket } | null {
  const ml = g.markets.filter((m) => m.type === "moneyline")
  if (ml.length !== 3 || ml.some((m) => !m.yesToken)) return null
  const isDraw = (m: PmMarket) => /^draw\b/i.test(m.groupTitle.trim()) || (!m.groupTitle && /\bdraw\b/i.test(m.question))
  const draws = ml.filter(isDraw)
  const sides = ml.filter((m) => !isDraw(m))
  if (draws.length !== 1 || sides.length !== 2 || sides.some((m) => !m.groupTitle.trim())) return null
  return { teams: [sides[0]!, sides[1]!], draw: draws[0]! }
}

/** The two team names of a game, in the exchange's order, from its two-outcome moneyline (soccer: from the team markets' titles). Null when it has none. */
export function groupTeams(g: PmGameGroup): [string, string] | null {
  const ml = g.markets.find((m) => m.type === "moneyline" && !isYesNo(m))
  if (ml) return [ml.outcomes[0]!, ml.outcomes[1]!]
  const t = threeWayOf(g)
  return t ? [t.teams[0].groupTitle.trim(), t.teams[1].groupTitle.trim()] : null
}

/* ---------------- gates ---------------- */

export type ClobBook = NonNullable<ReturnType<typeof parseClobBook>>
export type Gated = { ok: true; mid: number; spread: number; topSize: number } | { ok: false; reason: string }

/**
 * The repricer's gates applied to one CLOB book (the book of a binary market's first token; the other outcome is its mirror, so
 * its best bid/ask and sizes are the same numbers). `readAt` is when we fetched the book, `now` the clock of the caller.
 */
export function gateBook(book: ClobBook | undefined, readAt: Date, now: Date, mk: Pick<PmMarket, "acceptingOrders" | "updatedAt">): Gated {
  if (!book) return { ok: false, reason: "no book" }
  if (!mk.acceptingOrders) return { ok: false, reason: "not accepting orders" }
  if (mk.updatedAt && now.getTime() - mk.updatedAt.getTime() > EXCHANGE_ODDS.maxUpdateAgeMs) return { ok: false, reason: "market not updated" }
  if (now.getTime() - readAt.getTime() > REPRICE.maxAgeMs) return { ok: false, reason: "read too old" }
  if (book.ts && now.getTime() - book.ts.getTime() > REPRICE.maxBookTsAgeMs) return { ok: false, reason: "book timestamp stuck" }
  const { bid, ask } = book
  if (bid == null || ask == null || !(bid >= 0 && ask <= 1 && ask >= bid)) return { ok: false, reason: "invalid price" }
  if (ask - bid > REPRICE.maxSpread) return { ok: false, reason: "book too wide" }
  const sizes = [book.bidSize, book.askSize]
  if (!sizes.every((x): x is number => typeof x === "number" && Number.isFinite(x)) || Math.min(...sizes) < REPRICE.minTopSize) return { ok: false, reason: "book too thin" }
  const mid = (bid + ask) / 2
  if (!(mid > 0 && mid < 1)) return { ok: false, reason: "invalid price" }
  if (mid < REPRICE.minFair || mid > 1 - REPRICE.minFair) return { ok: false, reason: "price outside range" }
  return { ok: true, mid, spread: ask - bid, topSize: Math.min(...(sizes as number[])) }
}

/* ---------------- planning and assembly (pure) ---------------- */

type LineCandidate = {
  market: PmMarket
  /** Home handicap for spreads (home covers it); the total line for totals. */
  point: number
  /** Probability of the first side (home covers / over) from Gamma's mid: ranking only. */
  coarse: number
  /** Whether the first side's probability is the first token's mid (true) or its complement (home is the second outcome). */
  direct: boolean
}

export type PlannedGame = {
  espn: EventResult
  group: PmGameGroup
  /** Index of OUR home team in the exchange's team order. */
  homeIndex: 0 | 1
  teams: [string, string]
  startsAt: Date
  moneyline: PmMarket | null
  /** Soccer: the home, draw and away YES markets. Then `moneyline` is null. */
  three: { home: PmMarket; draw: PmMarket; away: PmMarket } | null
  spreads: LineCandidate[]
  totals: LineCandidate[]
}

const coarseMid = (m: PmMarket): number | null => {
  if (m.bid == null || m.ask == null || m.ask < m.bid || m.ask - m.bid > EXCHANGE_ODDS.coarseSpread) return null
  if (m.liquidity == null || m.liquidity < EXCHANGE_ODDS.minLiquidity || !m.acceptingOrders) return null
  const mid = (m.bid + m.ask) / 2
  return mid > 0 && mid < 1 ? mid : null
}

const nearest = (xs: LineCandidate[]): LineCandidate[] =>
  [...xs].sort((a, b) => Math.abs(a.coarse - 0.5) - Math.abs(b.coarse - 0.5) || Math.abs(a.point) - Math.abs(b.point)).slice(0, EXCHANGE_ODDS.candidatesPerKind)

/** Joins ESPN's scheduled games to Gamma games and lists the markets worth reading. A game with no unambiguous match is left out. */
export function planGames(sport: Sport, schedule: EventResult[], groups: PmGameGroup[], now: Date): { games: PlannedGame[]; unmatched: number } {
  const candidates: (Candidate & { group: PmGameGroup })[] = []
  for (const g of groups) {
    const teams = groupTeams(g)
    if (teams && g.startsAt && !g.live && !g.ended) candidates.push({ id: g.slug, teams, startsAt: g.startsAt, group: g })
  }
  const games: PlannedGame[] = []
  let unmatched = 0
  for (const e of schedule) {
    if (!e.homeName || !e.awayName || !e.startsAt) continue
    let m = matchGame({ homeName: e.homeName, awayName: e.awayName, startsAt: e.startsAt }, candidates)
    // College football and basketball: Polymarket titles carry the school only ("Troy"), ESPN's full name adds the nickname ("Troy Trojans").
    // Retry on ESPN's school name. Same rules apply (both teams, close start, unique), so a near-miss still stays unmatched.
    if (!m && (sport === "cfb" || sport === "ncaab") && e.homeShort && e.awayShort) m = matchGame({ homeName: e.homeShort, awayName: e.awayShort, startsAt: e.startsAt }, candidates)
    // MLS: exchanges often write the city alone ("Atlanta", "Seattle") where ESPN writes the club. Retry accepting a leading city;
    // still both teams, close start and unique, and a city that fits both sides ("Los Angeles" vs "Los Angeles") stays unmatched.
    if (!m && isSoccer(sport)) m = matchGame({ homeName: e.homeName, awayName: e.awayName, startsAt: e.startsAt }, candidates, { loose: true })
    if (!m) {
      unmatched++
      continue
    }
    const g = m.candidate.group
    // Lock at the earlier of the two start times: a feed that thinks the game starts sooner closes picks sooner.
    const startsAt = g.startsAt!.getTime() < e.startsAt.getTime() ? g.startsAt! : e.startsAt
    if (startsAt.getTime() <= now.getTime()) continue
    const homeName = m.candidate.teams[m.homeIndex]
    const subjectIsHome = (m2: PmMarket) => sameTeam(m2.outcomes[0]!, homeName)
    const subjectIsAway = (m2: PmMarket) => sameTeam(m2.outcomes[0]!, m.candidate.teams[1 - m.homeIndex]!)
    const spreads: LineCandidate[] = []
    const totals: LineCandidate[] = []
    for (const mk of g.markets) {
      const c = coarseMid(mk)
      if (c == null) continue
      if (mk.type === "spreads") {
        // Outcome 0 is the team the line belongs to; the other side is its complement at the opposite handicap.
        if (subjectIsHome(mk) === subjectIsAway(mk)) continue
        if (!Number.isFinite(mk.line!) || Number.isInteger(mk.line!)) continue
        const home = subjectIsHome(mk)
        const p = home ? c : 1 - c
        if (Math.abs(p - 0.5) > EXCHANGE_ODDS.mainLineBand) continue
        spreads.push({ market: mk, point: home ? mk.line! : -mk.line!, coarse: p, direct: home })
      } else if (mk.type === "totals") {
        if (!/^over$/i.test(mk.outcomes[0]!.trim()) || !/^under$/i.test(mk.outcomes[1]!.trim())) continue
        if (Math.abs(c - 0.5) > EXCHANGE_ODDS.mainLineBand) continue
        totals.push({ market: mk, point: mk.line!, coarse: c, direct: true })
      }
    }
    const moneyline = g.markets.find((x) => x.type === "moneyline" && !isYesNo(x)) ?? null
    const t3 = moneyline ? null : threeWayOf(g)
    // Team markets are in the exchange's order; ours is home = teams[homeIndex].
    const three = t3 ? { home: t3.teams[m.homeIndex], draw: t3.draw, away: t3.teams[1 - m.homeIndex] } : null
    games.push({ espn: e, group: g, homeIndex: m.homeIndex, teams: m.candidate.teams, startsAt, moneyline, three, spreads: nearest(spreads), totals: nearest(totals) })
  }
  return { games, unmatched }
}

/** Tokens whose books the assembly will read. */
export function tokensNeeded(games: PlannedGame[]): string[] {
  const out = new Set<string>()
  for (const g of games) {
    if (g.moneyline) out.add(g.moneyline.tokens[g.homeIndex]!)
    if (g.three) for (const mk of [g.three.home, g.three.draw, g.three.away]) out.add(mk.yesToken!)
    for (const c of [...g.spreads, ...g.totals]) out.add(c.market.tokens[0]!)
  }
  return [...out]
}

const quote = (p: number, point: number | null, at: Date): BookQuote => ({ book: "polymarket", price: rawAmerican(p), point, at })

export type Hidden = Record<string, number>

/**
 * Builds the provider events for planned games from the books that were read. Pure. `kalshiHome` gives the Kalshi view of
 * P(home) for a game (null when none / unusable). Anything that fails a gate is counted in `hidden` and left out.
 */
export type KalshiView = { home: (g: PlannedGame) => number | null; three: (g: PlannedGame) => ThreeWayBooks | null }
export function assemble(sport: Sport, games: PlannedGame[], books: ReadonlyMap<string, ClobBook>, kalshi: KalshiView, readAt: Date, now: Date): { events: ProviderEvent[]; hidden: Hidden; held: string[]; detail: string[] } {
  const hidden: Hidden = {}
  /** Which games lost which market and why (first few), so a run note can name them. */
  const detail: string[] = []
  let gameName = ""
  /** `externalId::marketKey` of markets a gate hid THIS run on a game that is still on ESPN's schedule and not live: a transient miss, not a withdrawal. */
  const held: string[] = []
  let gameId = ""
  const hide = (what: string, reason: string) => {
    const k = `${what}: ${reason}`
    hidden[k] = (hidden[k] ?? 0) + 1
    if (reason !== "no market" && detail.length < 8) detail.push(`${gameName} ${what} (${reason})`)
    // "no market" means the exchange does not list that line at all; every other reason is a gate (spread, thin book, disagreement...).
    if (reason !== "no market") held.push(`${gameId}::${what}|`)
  }
  const events: ProviderEvent[] = []
  for (const g of games) {
    gameId = g.espn.externalId
    gameName = `${g.espn.awayName} @ ${g.espn.homeName}`
    const markets: ProviderMarket[] = []

    if (g.moneyline) {
      const r = gateBook(books.get(g.moneyline.tokens[g.homeIndex]!), readAt, now, g.moneyline)
      if (!r.ok) hide("moneyline", r.reason)
      else {
        const k = kalshi.home(g)
        if (k != null && Math.abs(k - r.mid) > REPRICE.disagree) hide("moneyline", "sources disagree")
        else
          markets.push({
            key: "moneyline",
            kind: "moneyline",
            outcomes: [
              { selection: "home", quotes: [quote(r.mid, null, readAt)] },
              { selection: "away", quotes: [quote(1 - r.mid, null, readAt)] },
            ],
          })
      }
    } else if (g.three) {
      const t = g.three
      const parts = [t.home, t.draw, t.away]
      const gates = parts.map((mk) => ({ mk, book: books.get(mk.yesToken!) }))
      const stale = parts.find((mk) => mk.updatedAt && now.getTime() - mk.updatedAt.getTime() > EXCHANGE_ODDS.maxUpdateAgeMs)
      const legs: LegQuote[] = []
      for (const [sel, { book }] of [["home", gates[0]!], ["draw", gates[1]!], ["away", gates[2]!]] as const) {
        if (book) legs.push({ selection: sel, bid: book.bid, ask: book.ask, bidSize: book.bidSize, askSize: book.askSize, sourceTs: book.ts, fetchedTs: readAt })
      }
      const triple = booksFromQuotes(legs, now, false)
      if (stale) hide("moneyline", "market not updated")
      else if (!triple) hide("moneyline", "no book")
      else {
        const x = exchangeThreeWay({ source: "polymarket", books: triple, other: kalshi.three(g), gameLive: false, acceptingOrders: parts.every((mk) => mk.acceptingOrders) })
        if (!x.ok) hide("moneyline", x.reason)
        else
          markets.push({
            key: "moneyline",
            kind: "moneyline",
            outcomes: [
              { selection: "home", quotes: [quote(x.view.fair[0], null, readAt)] },
              { selection: "draw", quotes: [quote(x.view.fair[1], null, readAt)] },
              { selection: "away", quotes: [quote(x.view.fair[2], null, readAt)] },
            ],
          })
      }
    } else hide("moneyline", "no market")

    for (const [kind, list] of [["spread", g.spreads], ["total", g.totals]] as const) {
      let reason = "no market"
      for (const c of list) {
        const r = gateBook(books.get(c.market.tokens[0]!), readAt, now, c.market)
        if (!r.ok) {
          reason = r.reason
          continue
        }
        // r.mid is the first outcome's probability; spreads are quoted for home, so flip when home is the second outcome.
        const first = kind === "spread" && !c.direct ? 1 - r.mid : r.mid
        if (first < REPRICE.minFair || first > 1 - REPRICE.minFair) {
          reason = "price outside range"
          continue
        }
        markets.push(
          kind === "spread"
            ? {
                key: "spread",
                kind: "spread",
                outcomes: [
                  { selection: "home", quotes: [quote(first, c.point, readAt)] },
                  { selection: "away", quotes: [quote(1 - first, -c.point, readAt)] },
                ],
              }
            : {
                key: "total",
                kind: "total",
                outcomes: [
                  { selection: "over", quotes: [quote(first, c.point, readAt)] },
                  { selection: "under", quotes: [quote(1 - first, c.point, readAt)] },
                ],
              },
        )
        reason = ""
        break
      }
      if (reason) hide(kind, reason)
    }

    if (markets.length === 0) continue
    events.push({
      externalId: g.espn.externalId,
      family: "espn",
      sport,
      homeName: g.espn.homeName!,
      awayName: g.espn.awayName!,
      startsAt: g.startsAt,
      markets,
    })
  }
  return { events, hidden, held, detail }
}

/* ---------------- Kalshi cross-check ---------------- */

/** Kalshi's P(home) for one game from its two team contracts, or null (no match, one-sided or crossed book). */
export function kalshiHomeProb(games: KalshiGame[] | null, g: Pick<PlannedGame, "espn" | "startsAt">, now: Date): number | null {
  if (!games || !g.espn.homeName || !g.espn.awayName) return null
  const timed = games.filter((k) => !k.expectedEnd || (k.expectedEnd.getTime() >= g.startsAt.getTime() && k.expectedEnd.getTime() - g.startsAt.getTime() <= 36 * 3_600_000))
  const m = matchGame({ homeName: g.espn.homeName, awayName: g.espn.awayName, startsAt: g.startsAt }, timed, { requireTime: false, loose: true })
  if (!m) return null
  const sides: { home?: ReturnType<typeof normalizeQuote>; away?: ReturnType<typeof normalizeQuote> } = {}
  for (const q of kalshiQuotes(m.candidate, g.espn.homeName, g.espn.awayName, now)) sides[q.selection as "home" | "away"] = normalizeQuote(q, now)
  if (!sides.home?.mid || !sides.away?.mid) return null
  return pairProbability(sides.home, sides.away)?.homeProb ?? null
}

/** Kalshi's home / draw / away contracts for a soccer game as cross-check books (sizes unknown, counted as the minimum), or null. */
export function kalshiThreeBooks(games: KalshiGame[] | null, g: Pick<PlannedGame, "espn" | "startsAt">, now: Date): ThreeWayBooks | null {
  if (!games || !g.espn.homeName || !g.espn.awayName) return null
  const timed = games.filter((k) => !k.expectedEnd || (k.expectedEnd.getTime() >= g.startsAt.getTime() && k.expectedEnd.getTime() - g.startsAt.getTime() <= 36 * 3_600_000))
  const m = matchGame({ homeName: g.espn.homeName, awayName: g.espn.awayName, startsAt: g.startsAt }, timed, { requireTime: false, loose: true })
  return m ? booksFromQuotes(kalshiQuotes(m.candidate, g.espn.homeName, g.espn.awayName, now), now, true) : null
}

/* ---------------- the provider ---------------- */

/** Counts upstream requests per sport and day. Memory by default; the cron wires a database-backed one so servers share it. */
export interface CallCap {
  /** Reserves one request; false when the day's budget for the sport is used up. */
  take(sport: Sport, now: Date): Promise<boolean>
}

export class MemoryCallCap implements CallCap {
  private readonly used = new Map<string, number>()
  private readonly max: number
  constructor(max: number = EXCHANGE_ODDS.callsPerSportPerDay) {
    this.max = max
  }
  async take(sport: Sport, now: Date) {
    const k = `${sport}|${now.toISOString().slice(0, 10)}`
    const n = (this.used.get(k) ?? 0) + 1
    this.used.set(k, n)
    return n <= this.max
  }
}

/** Raised when the day's request budget for a sport is used up. The caller reports it as a skip, not a failure. */
export class ExchangeCapError extends Error {
  constructor(sport: string) {
    super(`call cap reached for ${sport}`)
    this.name = "ExchangeCapError"
  }
}

export type ExchangeOptions = {
  fetch?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  clock?: () => number
  cap?: CallCap
  /** How far ahead games are published (the publish window). */
  windowMs?: number
  espnBaseUrl?: string
}

type Host = "espn" | "gamma" | "clob" | "kalshi"

export class ExchangeOddsProvider implements OddsProvider {
  readonly name = "exchange"
  private readonly fetchFn: typeof fetch
  private readonly sleep: (ms: number) => Promise<void>
  private readonly clock: () => number
  private readonly cap: CallCap
  private readonly windowMs: number
  private readonly espnBaseUrl: string | undefined
  private readonly coolUntil = new Map<Host, number>()
  private readonly schedules = new Map<Sport, { at: number; rows: EventResult[] }>()

  constructor(opts: ExchangeOptions = {}) {
    this.fetchFn = opts.fetch ?? ((input, init) => fetch(input, init))
    this.sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)))
    this.clock = opts.clock ?? Date.now
    this.cap = opts.cap ?? new MemoryCallCap()
    this.windowMs = opts.windowMs ?? 24 * 3_600_000
    this.espnBaseUrl = opts.espnBaseUrl
  }

  /** One request with the daily cap, retries with backoff on 429/5xx and network errors, and a cooldown after a final failure. */
  private async send(sport: Sport, now: Date, host: Host, url: string, init: RequestInit = {}): Promise<Response> {
    if ((this.coolUntil.get(host) ?? 0) > this.clock()) throw new Error(`${host} cooling down after errors`)
    let last: Response | null = null
    for (let attempt = 0; attempt <= EXCHANGE_ODDS.retries; attempt++) {
      if (!(await this.cap.take(sport, now))) throw new ExchangeCapError(sport)
      try {
        const res = await this.fetchFn(url, { ...init, signal: AbortSignal.timeout(15_000) })
        if (res.status !== 429 && res.status < 500) return res
        last = res
      } catch (error) {
        if (attempt === EXCHANGE_ODDS.retries) {
          this.coolUntil.set(host, this.clock() + EXCHANGE_ODDS.cooldownMs)
          throw error
        }
      }
      if (attempt < EXCHANGE_ODDS.retries) {
        const retryAfter = Number(last?.headers.get("retry-after"))
        await this.sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 5_000) : EXCHANGE_ODDS.backoffMs * 2 ** attempt)
      }
    }
    this.coolUntil.set(host, this.clock() + EXCHANGE_ODDS.cooldownMs)
    return last!
  }

  private async getJson(sport: Sport, now: Date, host: Host, url: string): Promise<unknown> {
    const res = await this.send(sport, now, host, url)
    if (!res.ok) throw new Error(`${host} ${res.status}`)
    return res.json()
  }

  /** ESPN's not-yet-started games inside the window; cached 10 minutes so the cron's schedule check and the fetch share it. */
  async schedule(sport: Sport, now: Date): Promise<EventResult[]> {
    const hit = this.schedules.get(sport)
    if (hit && this.clock() - hit.at < 10 * 60_000) return hit.rows
    const espn = new EspnResultsProvider((url, init) => this.send(sport, now, "espn", String(url), init), this.espnBaseUrl)
    const rows = await espn.schedule(sport, now, this.windowMs)
    this.schedules.set(sport, { at: this.clock(), rows })
    return rows
  }

  /** Free schedule check for the cron: null when ESPN cannot say (the caller then skips the sport). */
  async hasGameWithin(sport: Sport, now: Date): Promise<boolean | null> {
    if (!POLYMARKET_SERIES[sport]) return false
    try {
      return (await this.schedule(sport, now)).length > 0
    } catch {
      return null
    }
  }

  async fetchOdds(sport: Sport, now: Date): Promise<OddsSnapshot> {
    const series = POLYMARKET_SERIES[sport]
    const base = { provider: this.name, fetchedAt: now }
    if (!series) return { ...base, events: [], complete: true, notes: [`exchange: no game series for ${sport}`] }

    const schedule = await this.schedule(sport, now)
    if (schedule.length === 0) return { ...base, events: [], complete: true, notes: ["exchange: no games in the window"] }

    // Gamma list of the window, polite pages. Failing here fails the sport (nothing is published from a partial listing).
    const from = now.getTime()
    const to = now.getTime() + this.windowMs + EXCHANGE_ODDS.windowSlackMs
    let groups: PmGameGroup[] = []
    const raw: unknown[] = []
    // Every page full: games past the last one are unseen, so their absence proves nothing (complete:false below).
    let truncated = false
    for (let page = 0; page < EXCHANGE_ODDS.maxPages; page++) {
      const url = gammaGamesUrl(series, from, to, page * GAMMA_PAGE)
      const list = await this.getJson(sport, now, "gamma", url)
      if (!Array.isArray(list)) throw new Error("gamma returned a non-list")
      raw.push(...list)
      if (list.length < GAMMA_PAGE) break
      if (page === EXCHANGE_ODDS.maxPages - 1) truncated = true
    }
    groups = parseGammaGroups(raw)
    const { games, unmatched } = planGames(sport, schedule, groups, now)

    // Order books for the chosen markets only.
    const books = new Map<string, ClobBook>()
    let failures = 0
    const tokens = tokensNeeded(games)
    for (let i = 0; i < tokens.length; i += EXCHANGE_ODDS.clobChunk) {
      const chunk = tokens.slice(i, i + EXCHANGE_ODDS.clobChunk)
      try {
        const res = await this.send(sport, now, "clob", `${CLOB}/books`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(chunk.map((token_id) => ({ token_id }))) })
        if (!res.ok) throw new Error(`clob ${res.status}`)
        const body = await res.json()
        for (const b of Array.isArray(body) ? body : []) {
          const p = parseClobBook(b)
          if (p) books.set(p.assetId, p)
        }
      } catch (error) {
        if (error instanceof ExchangeCapError) throw error
        failures++
      }
    }

    // Kalshi cross-check (moneyline only): its failure only removes the cross-check.
    let kalshi: KalshiGame[] | null = null
    const notes: string[] = []
    const kSeries = KALSHI_SERIES[sport]
    if (kSeries && games.length > 0) {
      try {
        kalshi = parseKalshiEvents(await this.getJson(sport, now, "kalshi", `${KALSHI}/events?series_ticker=${kSeries}&status=open&with_nested_markets=true&limit=100`))
      } catch (error) {
        if (error instanceof ExchangeCapError) throw error
        notes.push("kalshi: unavailable, no cross-check this run")
      }
    }

    const { events, hidden, held, detail } = assemble(sport, games, books, { home: (g) => kalshiHomeProb(kalshi, g, now), three: (g) => kalshiThreeBooks(kalshi, g, now) }, now, now)
    const hiddenText = Object.entries(hidden).map(([k, n]) => `${k} x${n}`).join("; ")
    notes.unshift(`exchange: ${events.length} of ${schedule.length} scheduled games priced${unmatched ? `, ${unmatched} not matched to an exchange game` : ""}${hiddenText ? `; hidden: ${hiddenText}` : ""}${detail.length ? `; e.g. ${detail.join(", ")}` : ""}${failures ? `; ${failures} book request(s) failed` : ""}`)
    if (truncated) notes.push(`gamma: listing truncated at ${EXCHANGE_ODDS.maxPages} pages`)
    return { ...base, events, held, complete: failures === 0 && !truncated, notes }
  }
}
