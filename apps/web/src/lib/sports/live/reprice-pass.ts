import { isWatched } from "./activity.ts"
import { inQuietHours, msToNextSlot, QUIET_SLOT_MS, slotElapsed } from "./slots.ts"
import { canRecoverFreeze, confirmDue, decideReprice, REPRICE, type ExchangeView, type RepriceTarget } from "../reprice.ts"
import { explainNoMatch, matchExchangeGame, matchGame } from "./match.ts"
import { booksFromQuotes, exchangeThreeWay, type ThreeWayExchangeResult } from "../threeway-exchange.ts"
import { normalizeQuote, pairProbability } from "./quote.ts"
import { KALSHI_SERIES, kalshiQuotes, parseGammaEvents, parseKalshiEvents, pmQuotes, POLYMARKET_SERIES, type KalshiGame, type PmGame } from "./sources.ts"
import type { NormalizedQuote, RawQuote } from "./types.ts"
import { CLOB, gammaEvents, guarded, KALSHI, slow, type WorkerDeps, type WorkerState } from "./worker.ts"

/**
 * One pregame repricing pass: for every open, unstarted moneyline market, read the exchange books (Polymarket primary,
 * Kalshi cross-check/fallback), build an ExchangeView and let `decideReprice` say update / freeze / nothing. The decision
 * and its thresholds live in lib/sports/reprice.ts; this file only fetches, matches and applies.
 *
 * Upstream cost per pass: one Gamma list per sport with targets, one batched CLOB /books call for all matched tokens, one
 * Kalshi list per sport (30s cache). It scales with games, never with viewers.
 */

export type PassResult = {
  targets: number
  matched: number
  updated: number
  frozen: number
  held: number
  confirmed: number
  unmatched: number
  /** True when the pass was not due and made no upstream call. */
  skipped: boolean
  /** When the next pass is due: 30s while a target starts within the window, else the next shared slot (see slots.ts). */
  nextPassMs: number
}

type Sides = { home?: NormalizedQuote; away?: NormalizedQuote; draw?: NormalizedQuote }

/** Both outcome books, uncrossed and two-sided, as one view of P(home). Null when either side is unusable. */
function bookView(raws: RawQuote[], now: Date) {
  const sides: Sides = {}
  for (const r of raws) sides[r.selection] = normalizeQuote(r, now)
  if (!sides.home?.mid || !sides.away?.mid) return null
  const pair = pairProbability(sides.home, sides.away)
  if (!pair) return null
  const tsAges = raws.map((r) => (r.sourceTs ? r.fetchedTs.getTime() - r.sourceTs.getTime() : null)).filter((x): x is number => x != null)
  const sizes = raws.flatMap((r) => [r.bidSize, r.askSize])
  const topSize = sizes.length > 0 && sizes.every((x): x is number => typeof x === "number" && Number.isFinite(x)) ? Math.min(...sizes) : null
  return { probA: pair.homeProb, spread: pair.spread, topSize, ageMs: Math.max(0, ...raws.map((r) => now.getTime() - r.fetchedTs.getTime())), bookTsAgeMs: tsAges.length ? Math.max(...tsAges) : null }
}

export async function runRepricePass(deps: WorkerDeps, st: WorkerState, now: Date): Promise<PassResult | null> {
  const store = deps.reprice
  if (!store) return null
  // Not due: answer from memory. Only the database read below can keep a serverless Postgres awake, and nothing can be due before
  // the next slot or before the nearest known game enters the fast window.
  if (now.getTime() < st.reprice.nextListAt) return { targets: st.reprice.lastTargets, matched: 0, updated: 0, frozen: 0, held: 0, confirmed: 0, unmatched: 0, skipped: true, nextPassMs: st.reprice.nextListAt - now.getTime() }
  const targets = await store.listTargets(now)
  st.reprice.lastTargets = targets.length
  const result: PassResult = { targets: targets.length, matched: 0, updated: 0, frozen: 0, held: 0, confirmed: 0, unmatched: 0, skipped: false, nextPassMs: REPRICE.farPassMs }
  if (targets.length === 0) {
    // A live game can keep the outer worker ticking every 10s even when nothing is open for repricing.
    // Discover newly published targets on the normal fast-pass cadence, without an otherwise empty query each tick.
    st.reprice.nextListAt = now.getTime() + REPRICE.passMs
    return { ...result, skipped: true, nextPassMs: REPRICE.passMs }
  }
  const near = targets.some((t) => t.startsAt.getTime() - now.getTime() <= REPRICE.windowMs)
  const t = now.getTime()
  const soonest = Math.min(...targets.map((x) => x.startsAt.getTime()))
  // Nobody on the sports pages: a 30 second pass would only keep the database awake, so reprice once per shared slot. A viewer
  // is noticed at the next due pass (their requests stamp the activity row), and picks wait for a fresh price meanwhile
  // (priceNeedsRefresh). A store without an activity signal counts as watched, which is the old behaviour.
  const watched = store.lastActivity ? isWatched(await store.lastActivity(), now) : true
  const fast = near && watched
  // Nothing starts within the window plus an hour: in quiet hours the slot pass may run hourly (see slots.ts).
  const hourly = soonest - t > REPRICE.windowMs + QUIET_SLOT_MS
  // Slot-aligned passes wake early for a game entering the fast window only when someone is watching.
  const wakeMs = watched ? Math.min(msToNextSlot(t, hourly), soonest - REPRICE.windowMs - t) : msToNextSlot(t, hourly)
  if (fast) {
    const sinceLast = t - st.reprice.lastPassAt
    if (sinceLast < REPRICE.passMs) {
      st.reprice.nextListAt = st.reprice.lastPassAt + REPRICE.passMs
      return { ...result, skipped: true, nextPassMs: REPRICE.passMs - sinceLast }
    }
  } else {
    // Far or unwatched: one pass per shared slot, and no database read until the slot (or, when watched, the moment the nearest game enters the window).
    const next = t + Math.max(1_000, wakeMs)
    if (!slotElapsed(st.reprice.lastPassAt, t, hourly)) {
      st.reprice.nextListAt = next
      return { ...result, skipped: true, nextPassMs: Math.max(1_000, next - t) }
    }
  }
  st.reprice.lastPassAt = t
  result.nextPassMs = fast ? REPRICE.passMs : Math.max(1_000, wakeMs)
  st.reprice.nextListAt = t + result.nextPassMs

  const sports = [...new Set(targets.map((t) => t.sport))]
  const pmFor = new Map<string, { game: PmGame; homeIndex: 0 | 1 }>()
  const why = new Map<string, string>()
  for (const sport of sports) {
    const series = POLYMARKET_SERIES[sport]
    const mine = targets.filter((t) => t.sport === sport)
    if (!series) {
      mine.forEach((t) => why.set(t.marketId, "no_series_for_sport"))
      continue
    }
    // Games starting from now to a little past the reprice horizon (24h), by game time, paged.
    const list = await slow<unknown>(st, `pm-pre:${sport}`, now, () => gammaEvents(deps, st, now, series, now.getTime(), now.getTime() + 26 * 3600_000))
    if (!list) {
      mine.forEach((t) => why.set(t.marketId, "polymarket_unavailable"))
      continue
    }
    const games = parseGammaEvents(list)
    for (const t of mine) {
      const m = matchExchangeGame(t.sport, { homeName: t.homeName, awayName: t.awayName, startsAt: t.startsAt }, games)
      if (m) pmFor.set(t.eventId, { game: m.candidate, homeIndex: m.homeIndex })
      else why.set(t.marketId, explainNoMatch({ homeName: t.homeName, awayName: t.awayName, startsAt: t.startsAt }, games))
    }
  }

  // Order books for the matched, not-in-play games: one batched call.
  const tokens = [...pmFor.values()].filter((p) => !p.game.ended).flatMap((p) => (p.game.drawToken ? [...p.game.tokens, p.game.drawToken] : p.game.tokens))
  let books: unknown[] = []
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100)
    const res = await guarded(deps, st, now, "polymarket", () => deps.postJson(`${CLOB}/books`, chunk.map((token_id) => ({ token_id }))))
    if (Array.isArray(res)) books = books.concat(res)
  }

  const kalshi = new Map<string, KalshiGame[]>()
  for (const sport of sports) {
    const series = KALSHI_SERIES[sport]
    if (!series) continue
    const games = await slow<KalshiGame[]>(st, `kalshi:${sport}`, now, async () => {
      const res = await guarded(deps, st, now, "kalshi", () => deps.getJson(`${KALSHI}/events?series_ticker=${series}&status=open&with_nested_markets=true&limit=100`))
      return res ? parseKalshiEvents(res) : null
    })
    if (games) kalshi.set(sport, games)
  }

  const toConfirm: string[] = []
  for (const t of targets) {
    const three = t.state.prices.length === 3
    const exchange = three ? null : buildView(t, pmFor.get(t.eventId), books, kalshi.get(t.sport), now)
    const exchange3 = three ? buildView3(t, pmFor.get(t.eventId), books, kalshi.get(t.sport), now) : undefined
    if (exchange || exchange3) result.matched++
    else result.unmatched++
    // A temporary pregame freeze is judged as a new publication. A larger re-entry step needs both sources, like first contact.
    // It is judged as if open and reopens only on a healthy
    // read (update or confirm); a freeze or hold decision leaves it closed. Never reopened straight from the heartbeat.
    const wasLocked = t.state.status === "locked"
    // Slot-cadence reads (far games, or no viewer) get the longer stale tolerance: one bad read between passes must not freeze a market.
    const slowRead = !fast || t.startsAt.getTime() - now.getTime() > REPRICE.windowMs
    // Hourly reads (quiet hours, or the first passes after them) get two missed hourly passes of tolerance.
    const hourlyRead = hourly && (inQuietHours(now.getTime()) || inQuietHours(now.getTime() - 2 * QUIET_SLOT_MS))
    const d = decideReprice({ now, startsAt: t.startsAt, staleFreezeMs: hourlyRead ? REPRICE.quietStaleFreezeMs : slowRead ? REPRICE.farStaleFreezeMs : undefined, eventStatus: t.eventStatus, recovering: wasLocked && canRecoverFreeze(t.frozenReason ?? null), market: wasLocked ? { ...t.state, status: "open" } : t.state, exchange, exchange3 })
    const label = `${t.awayName} @ ${t.homeName}`
    if (wasLocked) {
      if (!(d.action === "update" || (d.action === "none" && d.confirm)) || !store.recover) {
        result.held++
        if (now.getTime() - (st.reprice.holdLogAt.get(t.marketId) ?? 0) >= 60_000) {
          st.reprice.holdLogAt.set(t.marketId, now.getTime())
          deps.emit?.("warn", "live.reprice_hold", { marketId: t.marketId, game: label, reason: d.action === "update" ? "recovery not supported" : d.reason, recovering: true, exchange: exchange ? summary(exchange) : summary3(exchange3) })
        }
        continue
      }
      const recovered = await store.recover(t.marketId, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)
      if (!recovered.applied) {
        result.held++
        continue
      }
      if (d.action === "update") result.updated++
      else result.confirmed++
      deps.emit?.("info", "sports.market_reopened_exchange_ok", { marketId: t.marketId, game: label, prices: recovered.newPrices })
      continue
    }
    if (d.action === "update") {
      const r = await store.apply(t.marketId, { basis: t.state.fairProbA, count: t.state.repriceCount }, d, now)
      if (r.applied) {
        result.updated++
        deps.emit?.("info", "sports.line_repriced", {
          marketId: t.marketId,
          eventId: t.eventId,
          game: label,
          oldPrices: r.oldPrices,
          newPrices: r.newPrices,
          fairProbA: round(d.fairProbA),
          fairs: d.fairs ? d.fairs.map(round) : undefined,
          basis: t.state.fairProbA == null ? null : round(t.state.fairProbA),
          step: round(d.step),
          source: d.source,
          spread: d.spread == null ? null : round(d.spread),
          ageMs: Math.round(d.ageMs),
          version: r.version,
          startsInMin: Math.round((t.startsAt.getTime() - now.getTime()) / 60_000),
        })
      } else {
        result.held++
        deps.emit?.("warn", "sports.reprice_skipped", { marketId: t.marketId, game: label, reason: r.reason })
      }
    } else if (d.action === "freeze") {
      const done = await store.freeze(t.marketId, d.reason)
      if (done) result.frozen++
      deps.emit?.("warn", "sports.market_frozen_exchange", { marketId: t.marketId, eventId: t.eventId, game: label, reason: d.reason, frozen: done, exchange: exchange ? summary(exchange) : summary3(exchange3) })
    } else if (d.confirm) {
      if (confirmDue(t.state, now)) toConfirm.push(t.marketId)
    } else {
      result.held++
      // Throttled: one line a minute per market, and only for markets the exchange manages or that failed to match for a real reason.
      const quiet = why.get(t.marketId) === "no_series_for_sport" || (!t.state.exchangeOkAt && !exchange && !exchange3)
      if (!quiet && now.getTime() - (st.reprice.holdLogAt.get(t.marketId) ?? 0) >= 60_000) {
        st.reprice.holdLogAt.set(t.marketId, now.getTime())
        deps.emit?.("warn", "live.reprice_hold", { marketId: t.marketId, game: label, reason: d.reason, whyUnmatched: why.get(t.marketId) ?? null, exchange: exchange ? summary(exchange) : summary3(exchange3) })
      }
    }
  }
  if (toConfirm.length) {
    await store.confirm(toConfirm, now)
    result.confirmed += toConfirm.length
  }
  deps.emit?.("info", "live.reprice_pass", { ...result })
  return result
}

const round = (x: number) => Math.round(x * 1000) / 1000
const summary = (x: ExchangeView) => ({ source: x.source, probA: round(x.probA), spread: x.spread == null ? null : round(x.spread), topSize: x.topSize, ageMs: x.ageMs, bookTsAgeMs: x.bookTsAgeMs, other: x.other ? { source: x.other.source, probA: round(x.other.probA) } : null, gameLive: x.gameLive })

const summary3 = (x: ThreeWayExchangeResult | null | undefined) =>
  !x ? null : x.ok ? { source: x.view.source, fair: x.view.fair.map(round), spread: round(x.view.spread), topSize: x.view.topSize, ageMs: x.view.ageMs, other: x.view.other ? x.view.other.fair.map(round) : null } : { gate: x.action, reason: x.reason }

/** Kalshi's open game for one of our games (same time rule as the live worker's), or null. */
function matchKalshi(t: RepriceTarget, kalshiGames: KalshiGame[] | undefined): KalshiGame | null {
  if (!kalshiGames) return null
  const timed = kalshiGames.filter((g) => !g.expectedEnd || (g.expectedEnd.getTime() >= t.startsAt.getTime() && g.expectedEnd.getTime() - t.startsAt.getTime() <= 36 * 3600_000))
  return matchGame({ homeName: t.homeName, awayName: t.awayName, startsAt: t.startsAt }, timed, { requireTime: false, loose: true })?.candidate ?? null
}

/** Soccer moneyline: Polymarket's three YES books primary, Kalshi's three contracts as the cross-check (or, size unknown, a primary that only ever holds). */
function buildView3(t: RepriceTarget, pm: { game: PmGame; homeIndex: 0 | 1 } | undefined, books: unknown[], kalshiGames: KalshiGame[] | undefined, now: Date): ThreeWayExchangeResult | null {
  const k = matchKalshi(t, kalshiGames)
  const kRaws = k ? kalshiQuotes(k, t.homeName, t.awayName, now) : []
  const live = !!pm && pm.game.live && !pm.game.ended
  const pmBooks = pm && pm.game.drawToken ? booksFromQuotes(pmQuotes(pm.game, pm.homeIndex, books, now), now, false) : null
  if (pmBooks) return exchangeThreeWay({ source: "polymarket", books: pmBooks, other: booksFromQuotes(kRaws, now, true), gameLive: live, acceptingOrders: pm!.game.acceptingOrders })
  if (live) return { ok: false, action: "freeze", reason: "exchange shows the game in play before its scheduled start" }
  const kPrimary = booksFromQuotes(kRaws, now, false)
  return kPrimary ? exchangeThreeWay({ source: "kalshi", books: kPrimary, other: null, gameLive: false, acceptingOrders: true }) : null
}

function buildView(t: RepriceTarget, pm: { game: PmGame; homeIndex: 0 | 1 } | undefined, books: unknown[], kalshiGames: KalshiGame[] | undefined, now: Date): ExchangeView | null {
  const pmView = pm ? bookView(pmQuotes(pm.game, pm.homeIndex, books, now), now) : null
  let kView: ReturnType<typeof bookView> = null
  const km = matchKalshi(t, kalshiGames)
  if (km) kView = bookView(kalshiQuotes(km, t.homeName, t.awayName, now), now)
  const primary = pmView ? { v: pmView, source: "polymarket" as const } : kView ? { v: kView, source: "kalshi" as const } : null
  if (!primary) return pm && !pm.game.ended ? { probA: 0.5, spread: null, topSize: null, ageMs: 0, bookTsAgeMs: null, source: "polymarket", other: null, gameLive: pm.game.live && !pm.game.ended, acceptingOrders: pm.game.acceptingOrders, point: null } : null
  const other = primary.source === "polymarket" && kView ? { source: "kalshi" as const, probA: kView.probA } : null
  return {
    probA: primary.v.probA,
    spread: primary.v.spread,
    topSize: primary.v.topSize,
    ageMs: primary.v.ageMs,
    bookTsAgeMs: primary.v.bookTsAgeMs,
    source: primary.source,
    other,
    gameLive: !!pm && pm.game.live && !pm.game.ended,
    acceptingOrders: pm ? pm.game.acceptingOrders : true,
    point: null,
  }
}
