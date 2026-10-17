import { matchGame } from "./match.ts"
import { quoteKey, shouldWrite, type LastWrite, type QuoteKey, type SlateEvent } from "./plan.ts"
import { normalizeQuote } from "./quote.ts"
import {
  ESPN_PATH,
  KALSHI_SERIES,
  POLYMARKET_SERIES,
  espnGameState,
  espnWinProb,
  kalshiQuotes,
  parseEspnScoreboard,
  parseGammaEvents,
  parseKalshiEvents,
  pmGameState,
  pmQuotes,
  type EspnGame,
  type KalshiGame,
  type PmGame,
  type WsBook,
} from "./sources.ts"
import type { QuoteInsert } from "./store.ts"
import type { LiveGameState, RawQuote } from "./types.ts"

/**
 * One poll cycle of the live-odds worker, with every effect injected so it runs against fixtures in tests and
 * against a real database and the network in scripts/live-odds-worker.mts.
 *
 * Calls per cycle depend on the live slate only: 1 Gamma list per live sport + 1 batched CLOB `/books` for all
 * live tokens (REST mode), plus a Kalshi list per sport and ESPN fallbacks every 30s. Viewers never add calls.
 */

export type WorkerStore = {
  loadSlate(now: Date): Promise<(SlateEvent & { externalId: string })[]>
  insertQuotes(rows: QuoteInsert[]): Promise<void>
  upsertState(eventId: string, state: LiveGameState): Promise<void>
}

export type WorkerDeps = {
  store: WorkerStore
  /** GET json (throws on a non-2xx). */
  getJson(url: string): Promise<unknown>
  /** POST json (throws on a non-2xx). */
  postJson(url: string, body: unknown): Promise<unknown>
  /** Fresh top of book from the market WebSocket, if running. Tokens present and young skip the REST call. */
  wsBooks?: Map<string, WsBook>
  /** Called with the token ids the worker wants streamed. */
  wantTokens?(tokens: string[]): void
  log?(msg: string): void
}

export type WorkerState = {
  lastWrite: Map<QuoteKey, LastWrite>
  lastState: Map<string, { key: string; at: Date }>
  /** Per-source "do not call before" after an error or 429. */
  backoffUntil: Map<string, number>
  /** Slow-cadence caches (Kalshi, ESPN) so the 10s loop only makes those calls every 30s. */
  slow: Map<string, { at: number; value: unknown }>
  stats: { calls: number; rowsWritten: number; stateWrites: number; errors: number }
}

export const newWorkerState = (): WorkerState => ({
  lastWrite: new Map(),
  lastState: new Map(),
  backoffUntil: new Map(),
  slow: new Map(),
  stats: { calls: 0, rowsWritten: 0, stateWrites: 0, errors: 0 },
})

const GAMMA = "https://gamma-api.polymarket.com"
const CLOB = "https://clob.polymarket.com"
const KALSHI = "https://api.elections.kalshi.com/trade-api/v2"
const ESPN = "https://site.api.espn.com/apis/site/v2/sports"
export const SLOW_MS = 30_000
export const BACKOFF_MS = 30_000
/** A WebSocket book younger than this replaces the REST read for its token. */
export const WS_FRESH_MS = 5_000
const STATE_HEARTBEAT_MS = 15_000

async function guarded<T>(deps: WorkerDeps, st: WorkerState, now: Date, source: string, fn: () => Promise<T>): Promise<T | null> {
  if ((st.backoffUntil.get(source) ?? 0) > now.getTime()) return null
  try {
    st.stats.calls++
    return await fn()
  } catch (error) {
    st.stats.errors++
    st.backoffUntil.set(source, now.getTime() + BACKOFF_MS)
    deps.log?.(`${source} error (backing off ${BACKOFF_MS / 1000}s): ${error instanceof Error ? error.message : String(error)}`)
    return null
  }
}

async function slow<T>(st: WorkerState, key: string, now: Date, load: () => Promise<T | null>): Promise<T | null> {
  const hit = st.slow.get(key)
  if (hit && now.getTime() - hit.at < SLOW_MS) return hit.value as T
  const value = await load()
  if (value != null) st.slow.set(key, { at: now.getTime(), value })
  return value
}

export async function runTick(deps: WorkerDeps, st: WorkerState, now: Date): Promise<{ slate: number }> {
  const slate = await deps.store.loadSlate(now)
  const sports = [...new Set(slate.map((e) => e.sport))]
  const quotes: QuoteInsert[] = []
  const states = new Map<string, LiveGameState>()
  const pmFor = new Map<string, { game: PmGame; homeIndex: 0 | 1 }>()

  // 1. Polymarket: one Gamma list per live sport gives discovery, score, period and clock for every game at once.
  for (const sport of sports) {
    const series = POLYMARKET_SERIES[sport]
    if (!series) continue
    const list = await guarded(deps, st, now, "polymarket", () =>
      deps.getJson(`${GAMMA}/events?series_id=${series}&active=true&closed=false&limit=100&order=startDate&ascending=true`),
    )
    if (!list) continue
    const games = parseGammaEvents(list)
    for (const ev of slate.filter((e) => e.sport === sport)) {
      const m = matchGame(ev, games)
      if (!m) continue
      pmFor.set(ev.id, { game: m.candidate, homeIndex: m.homeIndex })
      states.set(ev.id, pmGameState(m.candidate, m.homeIndex, now))
    }
  }

  // 2. Order books for every matched, unfinished game: WebSocket where it is fresh, otherwise one batched REST call.
  const rawByEvent = new Map<string, RawQuote[]>()
  const wanted = [...pmFor.values()].filter((p) => !p.game.ended && p.game.acceptingOrders).flatMap((p) => p.game.tokens)
  deps.wantTokens?.(wanted)
  const restTokens: string[] = []
  const fromWs = new Map<string, WsBook>()
  for (const t of wanted) {
    const b = deps.wsBooks?.get(t)
    if (b && now.getTime() - b.ts.getTime() < WS_FRESH_MS) fromWs.set(t, b)
    else restTokens.push(t)
  }
  let restBooks: unknown[] = []
  if (restTokens.length) {
    for (let i = 0; i < restTokens.length; i += 100) {
      const chunk = restTokens.slice(i, i + 100)
      const res = await guarded(deps, st, now, "polymarket", () => deps.postJson(`${CLOB}/books`, chunk.map((token_id) => ({ token_id }))))
      if (Array.isArray(res)) restBooks = restBooks.concat(res)
    }
  }
  const wsAsBooks = [...fromWs.entries()].map(([asset_id, b]) => ({
    asset_id,
    bids: b.bid == null ? [] : [{ price: String(b.bid) }],
    asks: b.ask == null ? [] : [{ price: String(b.ask) }],
    timestamp: String(b.ts.getTime()),
  }))
  for (const [eventId, { game, homeIndex }] of pmFor) {
    if (game.ended || !game.acceptingOrders) continue
    rawByEvent.set(eventId, pmQuotes(game, homeIndex, [...restBooks, ...wsAsBooks], now))
  }

  // 3. Kalshi cross-check every 30s per sport, matched by team names.
  for (const sport of sports) {
    const series = KALSHI_SERIES[sport]
    if (!series) continue
    const games = await slow<KalshiGame[]>(st, `kalshi:${sport}`, now, async () => {
      const res = await guarded(deps, st, now, "kalshi", () => deps.getJson(`${KALSHI}/events?series_ticker=${series}&status=open&with_nested_markets=true&limit=100`))
      return res ? parseKalshiEvents(res) : null
    })
    if (!games) continue
    for (const ev of slate.filter((e) => e.sport === sport)) {
      const m = matchGame(ev, games, { requireTime: false, loose: true })
      if (!m) continue
      const q = kalshiQuotes(m.candidate, ev.homeName, ev.awayName, now)
      if (q.length) rawByEvent.set(ev.id, [...(rawByEvent.get(ev.id) ?? []), ...q])
    }
  }

  // 4. ESPN fallback, only for games Polymarket could not give a state or an exchange quote for.
  const needEspn = slate.filter((e) => ESPN_PATH[e.sport] && (!states.has(e.id) || !(rawByEvent.get(e.id) ?? []).some((r) => r.bid != null && r.ask != null)))
  for (const sport of [...new Set(needEspn.map((e) => e.sport))]) {
    const board = await slow<EspnGame[]>(st, `espn:${sport}`, now, async () => {
      const res = await guarded(deps, st, now, "espn", () => deps.getJson(`${ESPN}/${ESPN_PATH[sport]}/scoreboard`))
      return res ? parseEspnScoreboard(res) : null
    })
    if (!board) continue
    for (const ev of needEspn.filter((e) => e.sport === sport)) {
      const m = matchGame(ev, board)
      if (!m) continue
      if (!states.has(ev.id)) states.set(ev.id, espnGameState(m.candidate, m.homeIndex, now))
      if (m.candidate.state === "in" && !(rawByEvent.get(ev.id) ?? []).some((r) => r.bid != null && r.ask != null)) {
        const summary = await slow<unknown>(st, `espn-sum:${m.candidate.id}`, now, () =>
          guarded(deps, st, now, "espn", () => deps.getJson(`${ESPN}/${ESPN_PATH[sport]}/summary?event=${m.candidate.id}`)),
        )
        const wp = summary ? espnWinProb(summary, now) : null
        if (wp) rawByEvent.set(ev.id, [...(rawByEvent.get(ev.id) ?? []), wp])
      }
    }
  }

  // 5. Persist: a row per changed quote (plus a heartbeat), and the latest state per game.
  for (const [eventId, raws] of rawByEvent) {
    for (const raw of raws) {
      const key = quoteKey(eventId, "moneyline", raw.selection, raw.source)
      const nq = normalizeQuote(raw, now)
      const next = raw.mid != null ? { bid: null, ask: null } : { bid: raw.bid, ask: raw.ask }
      if (!shouldWrite(st.lastWrite.get(key), next, now)) continue
      quotes.push({
        eventId,
        market: "moneyline",
        selection: raw.selection,
        source: raw.source,
        bid: raw.bid,
        ask: raw.ask,
        mid: nq.mid,
        sourceTs: raw.sourceTs,
        fetchedTs: raw.fetchedTs,
      })
      st.lastWrite.set(key, { ...next, at: now })
    }
  }
  if (quotes.length) {
    await deps.store.insertQuotes(quotes)
    st.stats.rowsWritten += quotes.length
  }
  for (const [eventId, s] of states) {
    const key = `${s.status}|${s.homeScore}|${s.awayScore}|${s.period}|${s.clock}|${s.source}`
    const prev = st.lastState.get(eventId)
    if (prev && prev.key === key && now.getTime() - prev.at.getTime() < STATE_HEARTBEAT_MS) continue
    await deps.store.upsertState(eventId, s)
    st.lastState.set(eventId, { key, at: now })
    st.stats.stateWrites++
  }
  return { slate: slate.length }
}
