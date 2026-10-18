import type { RepriceStore } from "../reprice.ts"
import { cycleFailed } from "./health.ts"
import { clip, type Fields, type Level } from "../log.ts"
import { explainNoMatch, matchGame } from "./match.ts"
import { bookClock, quoteKey, shouldWrite, type BookClock, type LastWrite, type QuoteKey, type SlateEvent } from "./plan.ts"
import { hasDraw, type Sport } from "../types.ts"
import { normalizeQuote, pairProbability, pairProbability3 } from "./quote.ts"
import { chooseLiveOdds } from "./reconcile.ts"
import {
  CLOB,
  GAMMA,
  GAMMA_PAGE,
  KALSHI,
  ESPN_PATH,
  gammaGamesUrl,
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
import { eventTriggersEnabled, SettleTriggerTracker, type TriggerKind } from "../settle-trigger.ts"
import type { QuoteInsert } from "./store.ts"
import type { LiveGameState, LiveSource, RawQuote, SourceProb } from "./types.ts"

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
  /** Pregame repricing (optional; absent in tests that do not exercise it). */
  reprice?: RepriceStore
  /** How a book timestamp is trusted (see bookClock in plan.ts). Default strict. */
  bookMode?: "strict" | "fetch"
  /**
   * Asks the app for an immediate, targeted settle pass for one event (GET /api/cron/sports/settle?eventId=). It only asks: payout
   * still needs the results-provider quorum and stability window. Resolves `done: true` once the event settled, voided or went to review.
   */
  triggerSettle?(eventId: string, kind: TriggerKind): Promise<{ done: boolean }>
  log?(msg: string): void
  /** Structured one-line JSON logging (see log.ts). Absent in most tests. */
  emit?(level: Level, ev: string, fields?: Fields): void
}

export type WorkerState = {
  lastWrite: Map<QuoteKey, LastWrite>
  /** Our own record of when each book last changed, per key (M4). */
  clocks: Map<QuoteKey, BookClock>
  /** Last time a per-game book-clock line was logged. */
  clockLogAt: Map<string, number>
  lastState: Map<string, { key: string; at: Date }>
  /** Per-source "do not call before" after an error or 429. */
  backoffUntil: Map<string, number>
  /** Slow-cadence caches (Kalshi, ESPN) so the 10s loop only makes those calls every 30s. */
  slow: Map<string, { at: number; value: unknown }>
  stats: { calls: number; rowsWritten: number; stateWrites: number; errors: number }
  /** Per-cycle counters, reset at the start of every tick. */
  cycle: CycleStats
  /** Pregame repricing pass bookkeeping (see reprice-pass.ts). */
  reprice: { lastPassAt: number; holdLogAt: Map<string, number> }
  /** Last time the score orientation of a game was logged (raw vs interpreted), by event id. */
  orientAt: Map<string, number>
  /** Fast settle-trigger memory (final / clock-zero / exchange-decided signals) per live event. */
  trigger: SettleTriggerTracker
}

export type SourceStat = { ok: number; fail: number; ms: number }
export type CycleStats = { sources: Record<string, SourceStat>; skippedBackoff: number }
const freshCycle = (): CycleStats => ({ sources: {}, skippedBackoff: 0 })

export type TickResult = {
  slate: number
  /** Successful upstream calls this cycle. */
  okCalls: number
  failCalls: number
  /** Calls not made because a source was in backoff. */
  skippedBackoff: number
  rowsWritten: number
  rowsSkipped: number
  matched: number
  /** Live games that got no quote from any source this cycle, with why. */
  unmatched: { eventId: string; label: string; reason: string }[]
  sources: Record<string, SourceStat>
}

export const newWorkerState = (): WorkerState => ({
  lastWrite: new Map(),
  clocks: new Map(),
  clockLogAt: new Map(),
  lastState: new Map(),
  backoffUntil: new Map(),
  slow: new Map(),
  stats: { calls: 0, rowsWritten: 0, stateWrites: 0, errors: 0 },
  cycle: freshCycle(),
  orientAt: new Map(),
  trigger: new SettleTriggerTracker(),
  reprice: { lastPassAt: 0, holdLogAt: new Map() },
})

export { CLOB, GAMMA, KALSHI }
export { GAMMA_PAGE }
const ESPN = "https://site.api.espn.com/apis/site/v2/sports"
export const SLOW_MS = 30_000
export const BACKOFF_MS = 30_000
/** A WebSocket book younger than this replaces the REST read for its token. */
export const WS_FRESH_MS = 5_000
const STATE_HEARTBEAT_MS = 15_000
const ORIENT_LOG_MS = 5 * 60_000

export async function guarded<T>(deps: WorkerDeps, st: WorkerState, now: Date, source: string, fn: () => Promise<T>): Promise<T | null> {
  if ((st.backoffUntil.get(source) ?? 0) > now.getTime()) {
    st.cycle.skippedBackoff++
    return null
  }
  const stat = (st.cycle.sources[source] ??= { ok: 0, fail: 0, ms: 0 })
  const t0 = Date.now()
  try {
    st.stats.calls++
    const out = await fn()
    stat.ok++
    stat.ms += Date.now() - t0
    return out
  } catch (error) {
    st.stats.errors++
    stat.fail++
    stat.ms += Date.now() - t0
    st.backoffUntil.set(source, now.getTime() + BACKOFF_MS)
    deps.emit?.("warn", "live.backoff_start", { source, forMs: BACKOFF_MS, error: clip(error) })
    deps.log?.(`${source} error (backing off ${BACKOFF_MS / 1000}s): ${clip(error)}`)
    return null
  }
}

export async function slow<T>(st: WorkerState, key: string, now: Date, load: () => Promise<T | null>): Promise<T | null> {
  const hit = st.slow.get(key)
  if (hit && now.getTime() - hit.at < SLOW_MS) return hit.value as T
  const value = await load()
  if (value != null) st.slow.set(key, { at: now.getTime(), value })
  return value
}

/** Most Gamma pages one list may take (400 events): a safety stop, a normal slate is one or two. */
const GAMMA_MAX_PAGES = 4

/**
 * The Gamma events of one series inside a time window, paged politely. Null when the FIRST page fails (nothing known); a later page
 * failing returns what was read, since missing games then just fail to match (and a match is never guessed).
 */
export async function gammaEvents(deps: WorkerDeps, st: WorkerState, now: Date, series: string, fromMs: number, toMs: number): Promise<unknown[] | null> {
  const all: unknown[] = []
  for (let page = 0; page < GAMMA_MAX_PAGES; page++) {
    const res = await guarded(deps, st, now, "polymarket", () => deps.getJson(gammaGamesUrl(series, fromMs, toMs, page * GAMMA_PAGE)))
    if (!Array.isArray(res)) return page === 0 ? null : all
    all.push(...res)
    if (res.length < GAMMA_PAGE) break
  }
  return all
}

export async function runTick(deps: WorkerDeps, st: WorkerState, now: Date): Promise<TickResult> {
  st.cycle = freshCycle()
  for (const [source, until] of st.backoffUntil) {
    if (until <= now.getTime()) {
      st.backoffUntil.delete(source)
      deps.emit?.("info", "live.backoff_end", { source })
    }
  }
  const slate = await deps.store.loadSlate(now)
  const label = (e: { homeName: string; awayName: string }) => `${e.awayName} @ ${e.homeName}`
  const whyNot = new Map<string, string>()
  const sports = [...new Set(slate.map((e) => e.sport))]
  const quotes: QuoteInsert[] = []
  const states = new Map<string, LiveGameState>()
  const pmFor = new Map<string, { game: PmGame; homeIndex: 0 | 1 }>()

  // 1. Polymarket: one Gamma list per live sport gives discovery, score, period and clock for every game at once.
  for (const sport of sports) {
    const series = POLYMARKET_SERIES[sport]
    if (!series) {
      for (const ev of slate.filter((e) => e.sport === sport)) whyNot.set(ev.id, "no_series_for_sport")
      continue
    }
    // Games that started in the last 8 hours or start within the next hour (the live slate window).
    const list = await gammaEvents(deps, st, now, series, now.getTime() - 8 * 3600_000, now.getTime() + 3600_000)
    if (!list) {
      for (const ev of slate.filter((e) => e.sport === sport)) whyNot.set(ev.id, "polymarket_unavailable")
      continue
    }
    const games = parseGammaEvents(list)
    for (const ev of slate.filter((e) => e.sport === sport)) {
      const m = matchGame(ev, games)
      if (!m) {
        whyNot.set(ev.id, explainNoMatch(ev, games))
        continue
      }
      pmFor.set(ev.id, { game: m.candidate, homeIndex: m.homeIndex })
      states.set(ev.id, pmGameState(m.candidate, m.homeIndex, now))
      // Score orientation inputs, raw vs interpreted: the first thing to check if a score looks swapped.
      if (now.getTime() - (st.orientAt.get(ev.id) ?? 0) >= ORIENT_LOG_MS) {
        st.orientAt.set(ev.id, now.getTime())
        const s0 = states.get(ev.id)!
        deps.emit?.("info", "live.orientation", {
          eventId: ev.id,
          ourHome: ev.homeName,
          ourAway: ev.awayName,
          feedTeams: m.candidate.teams,
          feedSlug: m.candidate.slug,
          scoreRaw: m.candidate.scoreRaw,
          feedHomeIndex: m.homeIndex,
          interpreted: { home: s0.homeScore, away: s0.awayScore },
          period: m.candidate.period,
          clock: m.candidate.elapsed,
        })
      }
    }
  }

  // 2. Order books for every matched, unfinished game: WebSocket where it is fresh, otherwise one batched REST call.
  const rawByEvent = new Map<string, RawQuote[]>()
  const wanted = [...pmFor.values()].filter((p) => !p.game.ended && p.game.acceptingOrders).flatMap((p) => (p.game.drawToken ? [...p.game.tokens, p.game.drawToken] : p.game.tokens))
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
      // Time gate: a Kalshi event that carries an expected end must end within 12h after our start (and not before it);
      // without one, matchGame's uniqueness rule refuses a pairing that fits more than one open event.
      const timed = games.filter((g) => !g.expectedEnd || (g.expectedEnd.getTime() >= ev.startsAt.getTime() && g.expectedEnd.getTime() - ev.startsAt.getTime() <= 12 * 3600_000))
      const m = matchGame(ev, timed, { requireTime: false, loose: true })
      if (!m) {
        if (!whyNot.has(ev.id)) whyNot.set(ev.id, `kalshi:${explainNoMatch(ev, games, { requireTime: false, loose: true })}`)
        continue
      }
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
  let skipped = 0
  const ages: number[] = []
  // Bookkeeping is applied only after the insert succeeded (a failed write must be retried next tick, not skipped).
  const pendingWrites = new Map<QuoteKey, LastWrite>()
  const pendingClocks = new Map<QuoteKey, BookClock>()
  const clockInfo = new Map<string, { sourceAgeMs: number | null; changeAgeMs: number; quiet: boolean; selection: string }[]>()
  for (const [eventId, raws] of rawByEvent) {
    for (const raw of raws) {
      const key = quoteKey(eventId, "moneyline", raw.selection, raw.source)
      const next = raw.mid != null ? { bid: null, ask: null } : { bid: raw.bid, ask: raw.ask }
      const bc = bookClock(st.clocks.get(key), { sourceTs: raw.sourceTs, ...next }, raw.fetchedTs, deps.bookMode ?? "strict")
      pendingClocks.set(key, bc.clock)
      if (raw.source === "polymarket") {
        const l = clockInfo.get(eventId) ?? []
        l.push({ selection: raw.selection, sourceAgeMs: bc.sourceAgeMs, changeAgeMs: bc.changeAgeMs, quiet: bc.quiet })
        clockInfo.set(eventId, l)
      }
      const stored: RawQuote = { ...raw, sourceTs: bc.sourceTs }
      const nq = normalizeQuote(stored, now)
      if (!shouldWrite(st.lastWrite.get(key), next, now)) {
        skipped++
        continue
      }
      ages.push(nq.ageMs)
      quotes.push({
        eventId,
        market: "moneyline",
        selection: raw.selection,
        source: raw.source,
        bid: raw.bid,
        ask: raw.ask,
        mid: nq.mid,
        sourceTs: bc.sourceTs,
        fetchedTs: raw.fetchedTs,
      })
      pendingWrites.set(key, { ...next, at: now })
    }
  }
  if (quotes.length) {
    await deps.store.insertQuotes(quotes)
    st.stats.rowsWritten += quotes.length
  }
  for (const [k, v] of pendingWrites) st.lastWrite.set(k, v)
  for (const [k, v] of pendingClocks) st.clocks.set(k, v)
  // M4: per game, how old the book's own timestamp is vs how long ago the book last changed. A quiet live book with
  // large values for both means the timestamp is "last change"; a small sourceAgeMs always means "snapshot time".
  for (const [eventId, info] of clockInfo) {
    if (now.getTime() - (st.clockLogAt.get(eventId) ?? 0) < 60_000) continue
    st.clockLogAt.set(eventId, now.getTime())
    deps.emit?.("info", "live.book_clock", { eventId, mode: deps.bookMode ?? "strict", books: info })
  }
  for (const [eventId, s] of states) {
    const key = `${s.status}|${s.homeScore}|${s.awayScore}|${s.period}|${s.clock}|${s.source}`
    const prev = st.lastState.get(eventId)
    if (prev && prev.key === key && now.getTime() - prev.at.getTime() < STATE_HEARTBEAT_MS) continue
    await deps.store.upsertState(eventId, s)
    st.lastState.set(eventId, { key, at: now })
    st.stats.stateWrites++
  }

  // 5b. Fast settle triggers. The live feeds see a game end long before the settle cron polls, so a final status, a quiet 0:00 clock
  //     or a decided exchange price asks for an immediate targeted settle pass (rate limited per event, in the database too).
  //     It never pays out by itself; see settleEventNow.
  if (deps.triggerSettle && eventTriggersEnabled()) {
    st.trigger.prune(slate.map((e) => e.id))
    for (const ev of slate) {
      const s = states.get(ev.id)
      if (!s) continue
      const mids = (rawByEvent.get(ev.id) ?? []).filter((r) => r.source !== "espn").map((r) => normalizeQuote(r, now).mid).filter((m): m is number => m != null)
      const d = st.trigger.observe(ev.id, { sport: ev.sport as Sport, status: s.status, period: s.period, clock: s.clock, homeScore: s.homeScore, awayScore: s.awayScore, bestMid: mids.length ? Math.max(...mids) : null }, now.getTime())
      if (!d.fire) continue
      const kind: TriggerKind = d.fire === "status_final" ? "final" : "probe"
      deps.emit?.("info", "live.settle_trigger", { eventId: ev.id, game: label(ev), reason: d.fire })
      void deps
        .triggerSettle(ev.id, kind)
        .then((r) => st.trigger.result(ev.id, r.done, Date.now()))
        .catch((error) => {
          st.trigger.result(ev.id, false, Date.now())
          deps.emit?.("warn", "live.settle_trigger_failed", { eventId: ev.id, error: clip(error) })
        })
    }
  }

  // 6. What a viewer would be shown, per game: log low confidence, source mismatch and paused odds so a bad number
  //    is visible in the logs the moment it is served, not after someone reports it.
  const unmatched: TickResult["unmatched"] = []
  for (const ev of slate) {
    const raws = rawByEvent.get(ev.id) ?? []
    const pm = pmFor.get(ev.id)
    if (pm?.game.ended) continue
    if (raws.length === 0) {
      const reason = whyNot.get(ev.id) ?? (pm ? (pm.game.acceptingOrders ? "no_books_returned" : "market_not_accepting_orders") : "unknown")
      if (reason !== "no_series_for_sport") unmatched.push({ eventId: ev.id, label: label(ev), reason })
      deps.emit?.(reason === "no_series_for_sport" ? "info" : "warn", "live.no_quotes", { eventId: ev.id, game: label(ev), sport: ev.sport, reason })
      continue
    }
    const three = hasDraw(ev.sport, "moneyline")
    const views: SourceProb[] = []
    for (const source of ["polymarket", "kalshi", "espn"] as LiveSource[]) {
      const of = raws.filter((r) => r.source === source).map((r) => normalizeQuote(r, now))
      const side = (s: string) => of.find((q) => q.selection === s)
      const pair = three ? pairProbability3(side("home"), side("draw"), side("away")) : pairProbability(side("home"), side("away"))
      if (pair) views.push({ ...pair, source })
    }
    const shown = chooseLiveOdds(views, { threeWay: three })
    if (shown.status === "paused") {
      deps.emit?.("warn", "live.odds_paused", { eventId: ev.id, game: label(ev), reason: shown.reason, sources: views.map((v) => ({ s: v.source, p: round(v.homeProb), ageMs: v.ageMs, conf: v.confidence })) })
    } else if (shown.mismatch || shown.confidence === "low") {
      deps.emit?.("warn", shown.mismatch ? "live.source_mismatch" : "live.low_confidence", {
        eventId: ev.id,
        game: label(ev),
        shown: { source: shown.source, homeProb: round(shown.homeProb), confidence: shown.confidence },
        mismatch: shown.mismatch ? { with: shown.mismatch.with, diff: round(shown.mismatch.diff) } : null,
        sources: views.map((v) => ({ s: v.source, p: round(v.homeProb), spread: v.spread == null ? null : round(v.spread), ageMs: v.ageMs })),
      })
    }
  }

  const sources = st.cycle.sources
  const okCalls = Object.values(sources).reduce((n, x) => n + x.ok, 0)
  const failCalls = Object.values(sources).reduce((n, x) => n + x.fail, 0)
  const result: TickResult = { slate: slate.length, okCalls, failCalls, skippedBackoff: st.cycle.skippedBackoff, rowsWritten: quotes.length, rowsSkipped: skipped, matched: pmFor.size, unmatched, sources }
  if (slate.length > 0 || failCalls > 0) {
    const bad = cycleFailed({ threw: false, slate: slate.length, okCalls, failCalls, skippedBackoff: st.cycle.skippedBackoff })
    deps.emit?.(bad ? "error" : failCalls > 0 || unmatched.length > 0 ? "warn" : "info", "live.cycle", {
      games: slate.length,
      matched: pmFor.size,
      unmatched: unmatched.length,
      sources: Object.fromEntries(Object.entries(sources).map(([k, v]) => [k, { ok: v.ok, fail: v.fail, ms: v.ms }])),
      skippedBackoff: st.cycle.skippedBackoff,
      rows: { written: quotes.length, skipped },
      stateWrites: states.size,
      quoteAgeMs: ages.length ? { min: Math.min(...ages), max: Math.max(...ages) } : null,
    })
  }
  return result
}

const round = (x: number) => Math.round(x * 1000) / 1000
