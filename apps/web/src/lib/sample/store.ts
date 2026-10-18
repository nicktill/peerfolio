/* eslint-disable @typescript-eslint/no-explicit-any -- the views are generic over the fixture shapes */
/**
 * The sample views' own state: trades in the sample stock league and picks in the sample sports league.
 * It lives in this browser tab (sessionStorage) and is applied to the static fixtures, so a visitor can try
 * the real trade panel and pick slip. Nothing here reaches an API or the database.
 */
import { SECURITIES } from "@web/lib/demo-data"
import { americanToDecimal } from "@web/lib/sports/odds"
import { priceParlayCashout } from "@web/lib/sports/parlay-cashout"
import { pregameCashout } from "@web/lib/sports/cashout"

const KEY = "pf-sample-state"
export const SAMPLE_EVENT = "pf-sample-changed"

type Held = { shares: number; averageCost: number }
type SampleState = {
  cash: number | null
  held: Record<string, Held> | null
  trades: { id: string; side: "buy" | "sell"; ticker: string; shares: number; price: number; at: string }[]
  credits: number | null
  picks: SportsPick[]
  /** Sample parlays sold back: id to the amount paid. */
  cashedParlays?: Record<string, number>
}
type SportsPick = {
  id: string
  lineId: string
  marketId: string
  selection: string
  stake: number
  price: number
  point: number | null
  totalReturn: number
  payout: number | null
  status: "open" | "won" | "lost" | "cashed_out"
  acceptedAt: string
  market: { kind: string; player: string | null; statKey: string | null }
  event: { sport: string; home: string; away: string; startsAt: string }
}

/** Cash, holdings and credits start from the snapshot (`null` until a view or write supplies it). */
const fresh = (): SampleState => ({ cash: null, held: null, trades: [], credits: null, picks: [], cashedParlays: {} })

type FantasyBase = { you: { cash: number; positions: { ticker: string; shares: number; averageCost: number }[] } }
function startFantasy(state: SampleState, base: FantasyBase) {
  if (state.cash === null || state.held === null) {
    state.cash = base.you.cash
    state.held = Object.fromEntries(base.you.positions.map((p) => [p.ticker, { shares: p.shares, averageCost: p.averageCost }]))
  }
}

let memory: SampleState | null = null
function load(): SampleState {
  if (memory) return memory
  try {
    const raw = sessionStorage.getItem(KEY)
    if (raw) return (memory = JSON.parse(raw) as SampleState)
  } catch {}
  return (memory = fresh())
}
function save(state: SampleState) {
  memory = state
  try {
    sessionStorage.setItem(KEY, JSON.stringify(state))
  } catch {}
  window.dispatchEvent(new Event(SAMPLE_EVENT))
}

/** Back to the starting league and an empty slip. */
export function resetSample() {
  save(fresh())
}
/** Forgets everything without announcing it: used on exit. */
export function clearSample() {
  memory = null
  try {
    sessionStorage.removeItem(KEY)
  } catch {}
}

const SEC = new Map(SECURITIES.map((s) => [s.tickerSymbol, s]))
const priceOf = (ticker: string) => SEC.get(ticker)!.price

/** The price panel's lookup, answered from the sample's own securities. */
export function sampleQuote(symbol: string): Response {
  const sec = SEC.get(symbol.trim().toUpperCase())
  if (!sec) return new Response(JSON.stringify({ error: "That ticker isn't in the sample. Try NVDA, AAPL, MSFT or VTI." }), { status: 404 })
  return new Response(JSON.stringify({ symbol: sec.tickerSymbol, name: sec.name, price: sec.price, asOf: new Date().toISOString(), live: true }), { status: 200 })
}

/** The league page's data with your trades applied: positions, cash, return, rank, standings and feed. */
export function fantasyView<T extends { standings: any[]; you: any; feed: any[] }>(base: T): T {
  const s = load()
  startFantasy(s, base)
  const positions = Object.entries(s.held!).map(([ticker, h]) => {
    const price = priceOf(ticker)
    return { ticker, name: SEC.get(ticker)!.name, shares: h.shares, averageCost: h.averageCost, price, priceAsOf: null, value: +(h.shares * price).toFixed(2), gainPct: +(((price - h.averageCost) / h.averageCost) * 100).toFixed(2) }
  })
  const invested = positions.reduce((sum, p) => sum + p.value, 0)
  const value = +(s.cash! + invested).toFixed(2)
  const percent = +(((value - 100_000) / 100_000) * 100).toFixed(2)
  const weights = positions.map((p) => ({ ticker: p.ticker, name: null, weight: +((p.value / invested) * 100).toFixed(1) })).sort((a, b) => b.weight - a.weight)
  const others = base.standings.filter((p) => !p.isYou)
  const original = base.standings.find((p) => p.isYou)!
  // Demo history must end at the simulated portfolio value without a one-day jump.
  // Spread its correction through the fictional path, preserving the 100 starting point.
  const originalSpark: number[] | undefined = original.spark
  const adjustment = originalSpark?.length ? 100 + percent - originalSpark[originalSpark.length - 1]! : 0
  const spark = originalSpark && originalSpark.length > 1
    ? originalSpark.map((point, i) => point + adjustment * i / (originalSpark.length - 1))
    : originalSpark
  const me = { ...original, percent, value: Math.round(value), holdings: weights, spark }
  const ranked = [...others, me].sort((a, b) => b.percent - a.percent).map((p, i) => ({ ...p, rank: i + 1 }))
  const rank = ranked.find((p) => p.isYou)!.rank
  const mine = s.trades.map((t) => ({ id: t.id, name: "You", handle: null, image: null, side: t.side, ticker: t.ticker, shares: t.shares, price: t.price, at: t.at }))
  return { ...base, standings: ranked, you: { ...base.you, cash: +s.cash!.toFixed(2), value, percent, rank, positions }, feed: [...mine, ...base.feed] }
}

/** POST /api/fantasy/sample/trade, applied locally. Errors read like the real ones. */
export function applyTrade(base: FantasyBase, body: { side: "buy" | "sell"; symbol: string; amount?: number; shares?: number | "all" }) {
  const state = structuredClone(load())
  startFantasy(state, base)
  const ticker = body.symbol.trim().toUpperCase()
  const sec = SEC.get(ticker)
  if (!sec) throw new Error("That ticker isn't in the sample.")
  const price = sec.price
  let shares: number
  if (body.side === "buy") {
    const amount = Number(body.amount)
    if (!(amount > 0)) throw new Error("Enter an amount to invest.")
    if (amount > state.cash! + 0.005) throw new Error("Not enough cash.")
    shares = +(amount / price).toFixed(4)
    const held = state.held![ticker]
    state.held![ticker] = held ? { shares: +(held.shares + shares).toFixed(4), averageCost: +((held.shares * held.averageCost + shares * price) / (held.shares + shares)).toFixed(4) } : { shares, averageCost: price }
    state.cash = +(state.cash! - shares * price).toFixed(2)
  } else {
    const held = state.held![ticker]
    if (!held) throw new Error(`You don't hold ${ticker}.`)
    shares = body.shares === "all" ? held.shares : Number(body.shares)
    if (!(shares > 0)) throw new Error("Enter how many shares to sell.")
    if (shares > held.shares + 0.00005) throw new Error(`You only hold ${held.shares} shares of ${ticker}.`)
    shares = Math.min(shares, held.shares)
    state.cash = +(state.cash! + shares * price).toFixed(2)
    if (held.shares - shares < 0.0001) delete state.held![ticker]
    else state.held![ticker] = { ...held, shares: +(held.shares - shares).toFixed(4) }
  }
  state.trades.unshift({ id: `sample-t-${Date.now()}`, side: body.side, ticker, shares, price, at: new Date().toISOString() })
  save(state)
  return { ticker, shares, price }
}

type Line = { id: string; selection: string; point: number | null; price: number }
type Market = { id: string; kind: string; player: string | null; statKey: string | null; event: SportsPick["event"]; lines: Line[]; picked: { selection: string; stake: number } | null }

/** The sports league page's data with your picks on the slip: cash, open and settled picks, standings. */
export function sportsView<T extends { you: any; markets: Market[]; picks: any[]; leaguePicks: any[]; parlays?: any[]; standings: { name: string; credits: number; isYou: boolean }[] }>(base: T): T {
  const s = load()
  if (s.credits === null) s.credits = base.you.credits
  const mine = s.picks.map((p) => {
    const row: Record<string, unknown> = { ...p }
    delete row.lineId
    delete row.marketId
    return row
  })
  const markets = base.markets.map((m) => {
    const pick = s.picks.find((p) => p.marketId === m.id && p.status === "open")
    return pick ? { ...m, picked: { selection: pick.selection, stake: pick.stake } } : m
  })
  const standings = base.standings.map((p) => (p.isYou ? { ...p, credits: s.credits! + [...s.picks, ...base.picks].filter((x) => x.status === "open").reduce((n, x) => n + x.stake, 0) } : p)).sort((a, b) => b.credits - a.credits)
  return {
    ...base,
    you: { ...base.you, credits: s.credits! },
    markets,
    standings: standings.map((person) => {
      const history = person.isYou ? [...mine, ...base.picks] : base.leaguePicks.filter((p) => p.name === person.name)
      return { ...person, record: { won: history.filter((p) => p.status === "won").length, lost: history.filter((p) => p.status === "lost").length } }
    }),
    picks: [...mine, ...base.picks],
    ...(base.parlays ? { parlays: base.parlays.map((p) => (s.cashedParlays?.[p.id] != null ? { ...p, status: "cashed_out", payout: s.cashedParlays[p.id] } : p)) } : {}),
    leaguePicks: [...mine.map((p) => ({ ...p, name: "You" })), ...base.leaguePicks],
  }
}

/** POST /api/sports/leagues/sample/picks, applied locally. */
export function applyPick(base: { markets: Market[]; limits: { minStake: number; maxStake: number; maxOpenPicks: number } }, body: { lineId: string; stake: number }) {
  const state = structuredClone(load())
  if (state.credits === null) state.credits = (base as unknown as { you: { credits: number } }).you.credits
  const market = base.markets.find((m) => m.lines.some((l) => l.id === body.lineId))
  const line = market?.lines.find((l) => l.id === body.lineId)
  if (!market || !line) throw new Error("That line isn't available.")
  if (state.picks.some((p) => p.marketId === market.id && p.status === "open")) throw new Error("You already have a pick on this line.")
  const { minStake, maxStake, maxOpenPicks } = base.limits
  if (!(body.stake >= minStake)) throw new Error(`Minimum is ${minStake}`)
  if (body.stake > maxStake) throw new Error(`Maximum per pick is ${maxStake}`)
  if (body.stake > state.credits!) throw new Error("Not enough cash")
  if (state.picks.filter((p) => p.status === "open").length >= maxOpenPicks) throw new Error("You have the maximum number of open picks.")
  state.credits! -= body.stake
  state.picks.unshift({
    id: `sample-p-${Date.now()}`,
    lineId: line.id,
    marketId: market.id,
    selection: line.selection,
    stake: body.stake,
    price: line.price,
    point: line.point,
    totalReturn: Math.floor(body.stake * americanToDecimal(line.price)),
    payout: null,
    status: "open",
    acceptedAt: new Date().toISOString(),
    market: { kind: market.kind, player: market.player, statKey: market.statKey },
    event: market.event,
  })
  save(state)
  return { ok: true }
}

/** GET .../picks/<id>/cashout in the sample: sells at the line's current price (same pricing as the server). Only picks you placed here can be sold. */
type SampleQuote = { available: false; reason: string } | { available: true; value: number; source: string; stake: number; totalReturn: number; add?: { lineId: string; price: number; point: number | null } }
export function sampleCashoutQuote(base: { markets: Market[] }, pickId: string): SampleQuote {
  const pick = load().picks.find((p) => p.id === pickId)
  if (!pick || pick.status !== "open") return { available: false, reason: "This pick can't be sold in the sample" }
  const market = base.markets.find((m) => m.id === pick.marketId)
  const line = market?.lines.find((l) => l.id === pick.lineId)
  const quoted = pregameCashout({ stake: pick.stake, totalReturn: pick.totalReturn, kind: pick.market.kind, selection: pick.selection, point: pick.point ?? null }, { price: line?.price ?? pick.price, point: line?.point ?? pick.point ?? null }, true)
  if (!quoted) return { available: false, reason: "The price isn't available right now" }
  const value = quoted.value
  return { available: true, value, source: "pregame", stake: pick.stake, totalReturn: pick.totalReturn, ...(line ? { add: { lineId: line.id, price: line.price, point: line.point } } : {}) }
}

/** POST .../picks/<id>/cashout in the sample. */
export function applyCashout(base: { markets: Market[] }, pickId: string, expectedValue: number) {
  const quote = sampleCashoutQuote(base, pickId)
  if (!quote.available) throw new Error("Cash-out isn't available for this pick.")
  if (quote.value < Math.floor(expectedValue * 0.99)) throw new Error("The price moved. Review the new cash-out value and try again.")
  const amount = Math.min(expectedValue, quote.value)
  const state = structuredClone(load())
  const pick = state.picks.find((p) => p.id === pickId)!
  pick.status = "cashed_out"
  pick.payout = amount
  state.credits = (state.credits ?? 0) + amount
  save(state)
  return { cashout: { amount } }
}

type SampleParlay = { id: string; stake: number; totalReturn: number; status: string; legs: { lineId: string; selection: string; price: number; point: number | null; status: "open" | "won" | "lost" | "push" | "void"; market: { kind: string } }[] }
type SampleParlayQuote = { available: false; reason: string } | { available: true; value: number; source: string; stake: number; totalReturn: number }

/** GET .../parlays/<id>/cashout in the sample: the same pricing rules as the server, with every open leg at its line's current price. */
export function sampleParlayCashoutQuote(base: { markets: Market[]; parlays: SampleParlay[] }, parlayId: string): SampleParlayQuote {
  const parlay = base.parlays.find((p) => p.id === parlayId)
  if (!parlay || parlay.status !== "open" || load().cashedParlays?.[parlayId] != null) return { available: false, reason: "This parlay can't be sold in the sample" }
  const lines = new Map(base.markets.flatMap((m) => m.lines.map((l) => [l.id, l] as const)))
  const priced = priceParlayCashout(parlay, parlay.legs.map((l) => ({ status: l.status, price: l.price, kind: l.market.kind, selection: l.selection, point: l.point, phase: "pregame" as const, line: lines.get(l.lineId) ?? null, view: null })))
  return priced.available ? { available: true, value: priced.value, source: priced.source, stake: parlay.stake, totalReturn: parlay.totalReturn } : priced
}

/** POST .../parlays/<id>/cashout in the sample. */
export function applyParlayCashout(base: { markets: Market[]; parlays: SampleParlay[] }, parlayId: string, expectedValue: number) {
  const quote = sampleParlayCashoutQuote(base, parlayId)
  if (!quote.available) throw new Error("Cash-out isn't available for this parlay.")
  if (quote.value < Math.floor(expectedValue * 0.99)) throw new Error("The price moved. Review the new cash-out value and try again.")
  const amount = Math.min(expectedValue, quote.value)
  const state = structuredClone(load())
  state.cashedParlays = { ...state.cashedParlays, [parlayId]: amount }
  state.credits = (state.credits ?? 0) + amount
  save(state)
  return { cashout: { amount } }
}

export const openSamplePicks = () => load().picks.filter((p) => p.status === "open").length

/** Plays the open picks out: alternating win and loss (a win first), so both endings are seen. */
export function simulateGames() {
  const state = structuredClone(load())
  let wins = state.picks.filter((p) => p.status === "won").length
  for (const pick of [...state.picks].reverse()) {
    if (pick.status !== "open") continue
    const win = wins++ % 2 === 0
    pick.status = win ? "won" : "lost"
    pick.payout = win ? pick.totalReturn : 0
    if (win && state.credits !== null) state.credits += pick.totalReturn
  }
  save(state)
}
