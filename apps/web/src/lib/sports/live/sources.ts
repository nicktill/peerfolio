import { orientScore, sameTeamLoose, type Candidate } from "./match.ts"
import { topOfBook, topOfBookSized } from "./quote.ts"
import type { LiveGameState, LiveSelection, LiveStatus, RawQuote } from "./types.ts"

/**
 * Wire parsers for the live sources. Pure: JSON in, plain data out, no fetching, so they run against recorded
 * payloads in tests and are shared by the worker (REST and WebSocket) and any fallback reader.
 */

export const num = (x: unknown): number | null => {
  if (x === null || x === undefined || x === "") return null
  const n = Number(x)
  return Number.isFinite(n) ? n : null
}
export const date = (x: unknown): Date | null => {
  if (x === null || x === undefined || x === "") return null
  const d = typeof x === "number" || /^\d+$/.test(String(x)) ? new Date(Number(x)) : new Date(String(x).replace(" ", "T"))
  return Number.isNaN(d.getTime()) ? null : d
}
export const json = <T>(x: unknown): T | null => {
  if (Array.isArray(x)) return x as T
  if (typeof x !== "string") return null
  try {
    return JSON.parse(x) as T
  } catch {
    return null
  }
}

/** Public, keyless endpoints of the exchanges. Shared by the live worker and the exchange-first odds provider. */
export const GAMMA = "https://gamma-api.polymarket.com"
export const CLOB = "https://clob.polymarket.com"
export const KALSHI = "https://api.elections.kalshi.com/trade-api/v2"

/* ---------------- Polymarket ---------------- */

/** Polymarket Gamma series ids for a game series, from the exchange proof of concept. Tennis has no game series. */
export const POLYMARKET_SERIES: Record<string, string> = { nfl: "12185", nba: "10345", nhl: "10346", mlb: "3", cfb: "12756", mls: "10189" }

/** Gamma page size cap. A soccer game alone is up to 8 events (result, halftime, exact score, corners, props, more markets...). */
export const GAMMA_PAGE = 100
/**
 * Gamma events of one series whose game ends (= starts, for sports) inside [fromMs, toMs], soonest first. Ordering and filtering by
 * the game time, not the creation date, keeps a season's old events from filling the 100-event page; `offset` pages on.
 */
export const gammaGamesUrl = (series: string, fromMs: number, toMs: number, offset = 0): string =>
  `${GAMMA}/events?series_id=${series}&active=true&closed=false&limit=${GAMMA_PAGE}&offset=${offset}&order=endDate&ascending=true&end_date_min=${new Date(fromMs).toISOString()}&end_date_max=${new Date(toMs).toISOString()}`

export type PmGame = Candidate & {
  slug: string
  live: boolean
  ended: boolean
  /** "first-second" in the order of `teams` (title order); null before the game. */
  score: [number, number] | null
  /** The score string exactly as the feed sent it (clipped), kept so logs can show raw vs interpreted. */
  scoreRaw: string | null
  period: string | null
  elapsed: string | null
  /** CLOB token per outcome, in the order of `teams`. For a three-way game these are the two teams' YES tokens. */
  tokens: [string, string]
  /** Three-way (soccer) only: the YES token of the draw market. Null for a two-outcome game. */
  drawToken: string | null
  acceptingOrders: boolean
}

type Rec0 = Record<string, unknown>

/**
 * Soccer game winner: three binary markets (Yes/No) for "home wins", "draw", "away wins", each with its own YES token.
 * Returns the two team names (in listing order, from the market titles), their YES tokens and the draw YES token, or null
 * unless there are exactly two team markets and one draw market. A market not accepting orders stops the whole set.
 */
export function parseThreeWayMarkets(markets: Rec0[]): { teams: [string, string]; tokens: [string, string]; drawToken: string; acceptingOrders: boolean } | null {
  const ml = markets.filter((m) => m.sportsMarketType === "moneyline")
  if (ml.length !== 3) return null
  const yes = (m: Rec0): string | null => {
    const o = json<string[]>(m.outcomes)
    const t = json<string[]>(m.clobTokenIds)
    if (!o || !t || o.length !== 2 || t.length !== 2) return null
    const i = o.findIndex((x) => /^yes$/i.test(String(x).trim()))
    return i < 0 || !o.some((x) => /^no$/i.test(String(x).trim())) ? null : String(t[i])
  }
  const isDraw = (m: Rec0) => /^draw\b/i.test(String(m.groupItemTitle ?? "").trim()) || (!m.groupItemTitle && /\bdraw\b/i.test(String(m.question ?? "")))
  const draws = ml.filter(isDraw)
  const sides = ml.filter((m) => !isDraw(m))
  if (draws.length !== 1 || sides.length !== 2) return null
  const names = sides.map((m) => String(m.groupItemTitle ?? "").trim())
  const toks = [yes(sides[0]!), yes(sides[1]!)]
  const drawToken = yes(draws[0]!)
  if (names.some((n) => !n) || toks.some((t) => !t) || !drawToken) return null
  return { teams: [names[0]!, names[1]!], tokens: [toks[0]!, toks[1]!], drawToken, acceptingOrders: ml.every((m) => m.acceptingOrders !== false) }
}

/**
 * Game events from a Gamma `events` list. Only the moneyline market of a plain game event counts: sub-events
 * ("- Halftime Result", "- Exact Score") and props are ignored, and a market whose outcomes are not two team
 * names (Over/Under, Yes/No) is not a game winner.
 */
export function parseGammaEvents(payload: unknown): PmGame[] {
  if (!Array.isArray(payload)) return []
  const out: PmGame[] = []
  for (const ev of payload as Record<string, unknown>[]) {
    const markets = Array.isArray(ev.markets) ? (ev.markets as Record<string, unknown>[]) : []
    const ml = markets.find((m) => m.sportsMarketType === "moneyline")
    if (!ml) continue
    const outcomes = json<string[]>(ml.outcomes)
    const tokens = json<string[]>(ml.clobTokenIds)
    if (!outcomes || !tokens || outcomes.length !== 2 || tokens.length !== 2) continue
    // Soccer: three Yes/No markets (home, draw, away) instead of one two-team market.
    const three = outcomes.every((o) => /^(yes|no)$/i.test(String(o).trim())) ? parseThreeWayMarkets(markets) : null
    if (!three && outcomes.some((o) => /^(yes|no|over|under|draw)$/i.test(String(o).trim()))) continue
    const startsAt = date(ev.startTime) ?? date(ml.gameStartTime)
    const m = typeof ev.score === "string" ? /^(\d+)\s*[-:]\s*(\d+)$/.exec(ev.score.trim()) : null
    out.push({
      id: String(ev.slug ?? ev.id ?? ""),
      slug: String(ev.slug ?? ""),
      teams: three ? three.teams : [String(outcomes[0]), String(outcomes[1])],
      startsAt,
      live: ev.live === true,
      ended: ev.ended === true,
      score: m ? [Number(m[1]), Number(m[2])] : null,
      scoreRaw: typeof ev.score === "string" && ev.score ? ev.score.slice(0, 40) : null,
      period: typeof ev.period === "string" && ev.period ? ev.period : null,
      elapsed: typeof ev.elapsed === "string" && ev.elapsed ? ev.elapsed : null,
      tokens: three ? three.tokens : [String(tokens[0]), String(tokens[1])],
      drawToken: three ? three.drawToken : null,
      acceptingOrders: three ? three.acceptingOrders : ml.acceptingOrders !== false,
    })
  }
  return out.filter((g) => g.slug)
}

/** Polymarket's "not started" and "suspended" period codes carry no game clock. */
const PM_NO_CLOCK = new Set(["NS", "SUS", "Scheduled", "Postponed"])

export function pmGameState(g: PmGame, homeIndex: 0 | 1, fetchedTs: Date): LiveGameState {
  const status: LiveStatus = g.ended || /^(final|ft|f\/ot|f)$/i.test(g.period ?? "") ? "final" : g.live ? "live" : "pre"
  const sc = g.score ? orientScore(g.score[0], g.score[1], homeIndex) : { home: null, away: null }
  return {
    status,
    homeScore: sc.home,
    awayScore: sc.away,
    period: g.period && !PM_NO_CLOCK.has(g.period) ? g.period : null,
    clock: g.elapsed,
    source: "polymarket",
    sourceTs: null,
    fetchedTs,
  }
}

/** One CLOB book (REST `/book` item or one element of `POST /books`) to best bid/ask. Levels arrive unsorted. */
export function parseClobBook(book: unknown): { assetId: string; bid: number | null; ask: number | null; bidSize: number | null; askSize: number | null; ts: Date | null } | null {
  const b = book as { asset_id?: unknown; bids?: unknown; asks?: unknown; timestamp?: unknown } | null
  if (!b || typeof b.asset_id !== "string") return null
  const bids = Array.isArray(b.bids) ? (b.bids as { price: string; size?: string }[]) : []
  const asks = Array.isArray(b.asks) ? (b.asks as { price: string; size?: string }[]) : []
  return { assetId: b.asset_id, ...topOfBookSized(bids, asks), ts: date(b.timestamp) }
}

/** `POST /books` response to raw quotes for a matched game; a token missing from the response gives no quote. */
export function pmQuotes(game: PmGame, homeIndex: 0 | 1, books: unknown, fetchedTs: Date): RawQuote[] {
  const byAsset = new Map<string, NonNullable<ReturnType<typeof parseClobBook>>>()
  for (const raw of Array.isArray(books) ? books : [books]) {
    const p = parseClobBook(raw)
    if (p) byAsset.set(p.assetId, p)
  }
  const out: RawQuote[] = []
  for (const [i, selection] of ([[homeIndex, "home"], [(1 - homeIndex) as 0 | 1, "away"]] as [0 | 1, LiveSelection][])) {
    const p = byAsset.get(game.tokens[i])
    if (p) out.push({ source: "polymarket", selection, bid: p.bid, ask: p.ask, bidSize: p.bidSize, askSize: p.askSize, sourceTs: p.ts, fetchedTs })
  }
  if (game.drawToken) {
    const p = byAsset.get(game.drawToken)
    if (p) out.push({ source: "polymarket", selection: "draw", bid: p.bid, ask: p.ask, bidSize: p.bidSize, askSize: p.askSize, sourceTs: p.ts, fetchedTs })
  }
  return out
}

/* ---- market WebSocket (wss://ws-subscriptions-clob.polymarket.com/ws/market) ---- */

export type WsBook = { bid: number | null; ask: number | null; ts: Date }

/**
 * Folds one market-channel message (an object or an array of them) into a per-token top of book.
 * `book` carries full depth, `best_bid_ask` and `price_change` carry the best levels. Unknown events are ignored.
 * Returns the token ids touched.
 */
export function applyWsMessage(books: Map<string, WsBook>, message: unknown): string[] {
  const touched: string[] = []
  const items = Array.isArray(message) ? message : [message]
  for (const item of items as Record<string, unknown>[]) {
    if (!item || typeof item !== "object") continue
    const ts = date(item.timestamp) ?? new Date()
    const type = item.event_type
    if (type === "book" && typeof item.asset_id === "string") {
      const top = topOfBook(
        Array.isArray(item.bids) ? (item.bids as { price: string }[]) : [],
        Array.isArray(item.asks) ? (item.asks as { price: string }[]) : [],
      )
      books.set(item.asset_id, { ...top, ts })
      touched.push(item.asset_id)
    } else if (type === "best_bid_ask" && typeof item.asset_id === "string") {
      books.set(item.asset_id, { bid: num(item.best_bid), ask: num(item.best_ask), ts })
      touched.push(item.asset_id)
    } else if (type === "price_change" && Array.isArray(item.price_changes)) {
      for (const c of item.price_changes as Record<string, unknown>[]) {
        if (typeof c.asset_id !== "string") continue
        // price_change levels may omit a side; keep what we had for it.
        const prev = books.get(c.asset_id)
        const bid = "best_bid" in c ? num(c.best_bid) : (prev?.bid ?? null)
        const ask = "best_ask" in c ? num(c.best_ask) : (prev?.ask ?? null)
        books.set(c.asset_id, { bid, ask, ts })
        touched.push(c.asset_id)
      }
    }
  }
  return touched
}

/* ---------------- Kalshi ---------------- */

export const KALSHI_SERIES: Record<string, string> = { nfl: "KXNFLGAME", nba: "KXNBAGAME", nhl: "KXNHLGAME", mlb: "KXMLBGAME", cfb: "KXNCAAFGAME", mls: "KXMLSGAME" }

export type KalshiGame = Candidate & { expectedEnd: Date | null; markets: { ticker: string; team: string; bid: number | null; ask: number | null }[] }

/**
 * Open Kalshi game events with their per-team yes contracts (one binary market per team; the yes price is the
 * win probability). Titles read "Boston vs Detroit" or "HOU Texans vs JAC Jaguars"; the abbreviation token is dropped.
 * Kalshi gives no reliable start time here, so matching uses names (plus uniqueness) only.
 */
export function parseKalshiEvents(payload: unknown): KalshiGame[] {
  const events = (payload as { events?: unknown })?.events
  if (!Array.isArray(events)) return []
  const out: KalshiGame[] = []
  for (const ev of events as Record<string, unknown>[]) {
    const parts = String(ev.title ?? "")
      .split(/ vs\.? /i)
      .map((x) => x.replace(/^[A-Z]{2,4} (?=\S)/, "").trim())
    if (parts.length !== 2 || !parts[0] || !parts[1]) continue
    const markets = (Array.isArray(ev.markets) ? (ev.markets as Record<string, unknown>[]) : []).map((m) => ({
      ticker: String(m.ticker ?? ""),
      team: String(m.yes_sub_title ?? ""),
      bid: num(m.yes_bid_dollars),
      ask: num(m.yes_ask_dollars),
    }))
    // Soccer has a third contract for the draw ("Tie"); every other game has exactly the two team contracts.
    const ties = markets.filter((m) => /^(tie|draw)$/i.test(m.team.trim()))
    if (!(markets.length === 2 && ties.length === 0) && !(markets.length === 3 && ties.length === 1)) continue
    const m0 = (Array.isArray(ev.markets) ? (ev.markets as Record<string, unknown>[]) : [])[0] ?? {}
    out.push({
      id: String(ev.event_ticker ?? ev.title),
      teams: [parts[0], parts[1]],
      startsAt: null,
      // Kalshi gives no start time; the expected end (or market close) tells tonight's game from another night's.
      expectedEnd: date(m0.expected_expiration_time) ?? date(m0.close_time),
      markets,
    })
  }
  return out
}

/** Kalshi's `market.updated_time` can be weeks old on a live book, so freshness is our fetch time, never that field. */
export function kalshiQuotes(game: KalshiGame, homeName: string, awayName: string, fetchedTs: Date): RawQuote[] {
  const out: RawQuote[] = []
  for (const [name, selection] of [[homeName, "home"], [awayName, "away"]] as [string, LiveSelection][]) {
    const m = game.markets.find((x) => !/^(tie|draw)$/i.test(x.team.trim()) && sameTeamLoose(x.team, name))
    if (m) out.push({ source: "kalshi", selection, bid: m.bid, ask: m.ask, sourceTs: null, fetchedTs })
  }
  const tie = game.markets.find((x) => /^(tie|draw)$/i.test(x.team.trim()))
  if (tie) out.push({ source: "kalshi", selection: "draw", bid: tie.bid, ask: tie.ask, sourceTs: null, fetchedTs })
  return out
}

/* ---------------- ESPN ---------------- */

export const ESPN_PATH: Record<string, string> = { nfl: "football/nfl", nba: "basketball/nba", nhl: "hockey/nhl", mlb: "baseball/mlb", cfb: "football/college-football", mls: "soccer/usa.1" }

export type EspnGame = Candidate & {
  state: "pre" | "in" | "post"
  /** Scores in the order of `teams` (home first). */
  scores: [number | null, number | null]
  period: number | null
  clock: string | null
}

type Rec = Record<string, unknown>
const rec = (x: unknown): Rec => (x && typeof x === "object" ? (x as Rec) : {})

export function parseEspnScoreboard(payload: unknown): EspnGame[] {
  const events = (payload as { events?: unknown })?.events
  if (!Array.isArray(events)) return []
  const out: EspnGame[] = []
  for (const e of events.map(rec)) {
    const competitors = rec(Array.isArray(e.competitions) ? e.competitions[0] : null).competitors
    const teams = Array.isArray(competitors) ? competitors.map(rec) : []
    if (teams.length !== 2) continue
    const home = teams.find((t) => t.homeAway === "home")
    const away = teams.find((t) => t.homeAway === "away")
    if (!home || !away) continue
    const status = rec(e.status)
    const state = rec(status.type).state
    out.push({
      id: String(e.id),
      // Home first: `teams[0]` is home for ESPN.
      teams: [String(rec(home.team).displayName ?? ""), String(rec(away.team).displayName ?? "")],
      startsAt: date(e.date),
      state: state === "in" ? "in" : state === "post" ? "post" : "pre",
      scores: [num(home.score), num(away.score)],
      period: num(status.period),
      clock: typeof status.displayClock === "string" ? status.displayClock : null,
    })
  }
  return out
}

export function espnGameState(g: EspnGame, homeIndex: 0 | 1, fetchedTs: Date): LiveGameState {
  const sc = orientScore(g.scores[0], g.scores[1], homeIndex)
  return {
    status: g.state === "in" ? "live" : g.state === "post" ? "final" : "pre",
    homeScore: sc.home,
    awayScore: sc.away,
    period: g.period ? String(g.period) : null,
    clock: g.clock,
    source: "espn",
    sourceTs: null,
    fetchedTs,
  }
}

/** Last point of ESPN's `summary.winprobability` (home team's win share). A model, not a market: no book, no timestamp. */
export function espnWinProb(summary: unknown, fetchedTs: Date): RawQuote | null {
  const wp = (summary as { winprobability?: unknown })?.winprobability
  if (!Array.isArray(wp) || wp.length === 0) return null
  let p = num((wp[wp.length - 1] as { homeWinPercentage?: unknown }).homeWinPercentage)
  if (p == null) return null
  if (p > 1) p /= 100
  return { source: "espn", selection: "home", bid: null, ask: null, mid: p, sourceTs: null, fetchedTs }
}
