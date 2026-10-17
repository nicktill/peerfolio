import type { FantasyRow, PortfolioResponse } from "@web/components/dashboard/portfolio-screen"
import type { AccountRow } from "@web/components/dashboard/accounts-card"
import type { HoldingRow } from "@web/components/dashboard/holdings-table"
import { SECURITIES, makeRandom } from "@web/lib/demo-data"
import type { Range } from "@web/lib/ranges"

/**
 * An invented portfolio for the sign-in-free preview of the Portfolio page:
 * a Fidelity 401(k), two Robinhood accounts and cash, with a year of history.
 * Nothing here belongs to a real person.
 */

type Lot = { ticker: string; name: string; type: string; quantity: number; price: number; cost: number; today: number }
type DemoAccount = { id: string; name: string; mask: string; institution: string; logo: string | null; category: "investment" | "cash"; cash?: number; lots: Lot[] }

/** Fictional positions using the shared security catalogue; independent of real and seeded accounts. */
const securityById = new Map(SECURITIES.map((s) => [s.id, s]))
const costRandom = makeRandom(11)
const lotsFor = (mix: [string, number][]): Lot[] =>
  mix.map(([id, value]) => {
    const sec = securityById.get(id)!
    // Gains between about +4% and +58%, different on every position, as the seed script does.
    return { ticker: sec.tickerSymbol, name: sec.name, type: sec.type, quantity: value / sec.price, price: sec.price, cost: value / (1.04 + costRandom() * 0.54), today: sec.move }
  })

const ACCOUNTS: DemoAccount[] = [
  { id: "demo-401k", name: "401(k) Plan", mask: "6824", institution: "Fidelity", logo: "/landing/brokerages/fidelity.png", category: "investment", lots: lotsFor([["demo-voo", 24000], ["demo-vxus", 10500], ["demo-bnd", 7500]]) },
  { id: "demo-roth", name: "Robinhood Roth IRA", mask: "7318", institution: "Robinhood", logo: "/demo/robinhood.svg", category: "investment", lots: lotsFor([["demo-vti", 14000], ["demo-qqq", 9500], ["demo-schd", 6000], ["demo-msft", 5000], ["demo-cost", 3500]]) },
  { id: "demo-brokerage", name: "Robinhood Individual", mask: "2069", institution: "Robinhood", logo: "/demo/robinhood.svg", category: "investment", lots: lotsFor([["demo-nvda", 8500], ["demo-aapl", 7000], ["demo-msft", 6000], ["demo-googl", 5000], ["demo-amzn", 4500], ["demo-meta", 4000], ["demo-avgo", 3500], ["demo-cost", 3000], ["demo-v", 2500], ["demo-jpm", 2200], ["demo-lly", 1800], ["demo-nflx", 1400], ["demo-amd", 1100], ["demo-ko", 900], ["demo-dis", 600]]) },
  { id: "demo-checking", name: "Checking", mask: "8542", institution: "Chase", logo: null, category: "cash", cash: 3_240.50, lots: [] },
  { id: "demo-savings", name: "High-yield savings", mask: "9136", institution: "Chase", logo: null, category: "cash", cash: 14_500, lots: [] },
]

const round2 = (v: number) => Math.round(v * 100) / 100
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Market date in New York, so the demo's "today" lines up with the page's. */
function marketToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date())
}

/** Small deterministic PRNG, so the demo chart is the same on every load. */
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A year and a bit of weekday closes, as a return indexed to 100 on the first day. */
function history(today: string) {
  const days: string[] = []
  const d = new Date(`${today}T12:00:00Z`)
  while (days.length < 290) {
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) days.unshift(iso(d))
    d.setUTCDate(d.getUTCDate() - 1)
  }
  const rand = random(7)
  let level = 100
  return days.map((date, i) => {
    if (i > 0) {
      // A rising market with several rallies and drawdowns, plus daily variation.
      // One continuous series feeds every range, so changing the lens preserves history.
      const cycle = Math.sin(i / 17) * 0.0024 + Math.sin(i / 43 + 1.2) * 0.0015
      const correction = i >= 125 && i < 142 ? -0.004 : 0
      level *= 1 + 0.001 + cycle + correction + (rand() - 0.5) * 0.007
    }
    return { date, level }
  })
}

const SPAN: Record<Exclude<Range, "ALL">, number> = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }

export function demoPortfolio(range: Range): PortfolioResponse {
  const today = marketToday()
  const full = history(today)
  const start = range === "ALL" ? full[0]!.date : iso(new Date(new Date(`${today}T12:00:00Z`).getTime() - SPAN[range] * 86_400_000))
  const window = full.filter((p) => p.date >= start)
  const base = window[0]!.level
  const series = window.map((p) => ({ date: p.date, indexed: (p.level / base) * 100 }))

  const accounts: AccountRow[] = ACCOUNTS.map((a) => {
    const positions = a.lots.map((l, i) => ({
      id: `${a.id}-${i}`,
      ticker: l.ticker,
      name: l.name,
      kind: "stock" as const,
      quantity: l.quantity,
      price: l.price,
      value: round2(l.quantity * l.price),
      costBasis: l.cost,
      priceAsOf: today,
    }))
    return {
      id: a.id,
      name: a.name,
      mask: a.mask,
      category: a.category,
      balance: a.cash ?? positions.reduce((sum, p) => sum + p.value, 0),
      isLiability: false,
      source: "plaid" as const,
      institutionName: a.institution,
      institutionLogo: a.logo,
      itemId: a.category === "investment" ? `demo-connection-${a.institution.toLowerCase()}` : null,
      positions,
    }
  })

  // One row per security across accounts, as the real endpoint returns them.
  const bySymbol = new Map<string, { lot: Lot; quantity: number; value: number; cost: number; accounts: number }>()
  for (const a of ACCOUNTS) {
    for (const l of a.lots) {
      const row = bySymbol.get(l.ticker) ?? { lot: l, quantity: 0, value: 0, cost: 0, accounts: 0 }
      row.quantity += l.quantity
      row.value += l.quantity * l.price
      row.cost += l.cost
      row.accounts += 1
      bySymbol.set(l.ticker, row)
    }
  }
  const invested = [...bySymbol.values()].reduce((sum, r) => sum + r.value, 0)
  const holdings: HoldingRow[] = [...bySymbol.values()].map((r) => {
    const todayAmount = r.value - r.value / (1 + r.lot.today / 100)
    return {
      securityId: r.lot.ticker,
      ticker: r.lot.ticker,
      name: r.lot.name,
      type: r.lot.type,
      quantity: r.quantity,
      value: round2(r.value),
      weight: (r.value / invested) * 100,
      todayAmount: round2(todayAmount),
      todayPercent: r.lot.today,
      gainAmount: round2(r.value - r.cost),
      gainPercent: ((r.value - r.cost) / r.cost) * 100,
      positions: r.accounts,
    }
  })

  const kindOf = (h: HoldingRow) => (h.type === "cryptocurrency" ? "Crypto" : h.type === "etf" ? "ETFs" : h.type === "fixed_income" ? "Bonds" : "Stocks")
  const allocation = ["Stocks", "ETFs", "Bonds", "Crypto"]
    .map((name) => {
      const value = holdings.filter((h) => kindOf(h) === name).reduce((sum, h) => sum + h.value, 0)
      return { name, value, percent: (value / invested) * 100 }
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  const assets = accounts.filter((a) => !a.isLiability).reduce((sum, a) => sum + a.balance, 0)
  const liabilities = accounts.filter((a) => a.isLiability).reduce((sum, a) => sum + a.balance, 0)
  const netWorth = assets - liabilities
  const cash = netWorth - invested

  // Keep the dollar chart on the same market path as the return chart. Fictional
  // cash stays constant, so a synthetic deposit cannot create a misleading spike.
  const last = full[full.length - 1]!.level
  const dollarHistory = window.map((p) => {
    const investableAssets = invested * (p.level / last)
    return { date: p.date, netWorth: investableAssets + cash, investableAssets }
  })
  const todayAmount = holdings.reduce((sum, h) => sum + (h.todayAmount ?? 0), 0)
  const cost = holdings.reduce((sum, h) => sum + (h.value - (h.gainAmount ?? 0)), 0)

  return {
    summary: { totalAssets: assets, totalLiabilities: liabilities, netWorth, investableAssets: invested },
    accounts,
    items: [
      { id: "demo-connection-fidelity", institutionName: "Fidelity", institutionLogo: "/landing/brokerages/fidelity.png", status: "active", errorCode: null, lastSyncedAt: new Date(Date.now() - 10 * 3_600_000).toISOString() },
      { id: "demo-connection-robinhood", institutionName: "Robinhood", institutionLogo: "/demo/robinhood.svg", status: "active", errorCode: null, lastSyncedAt: new Date(Date.now() - 6 * 3_600_000).toISOString() },
    ],
    allocation,
    holdings,
    today: { amount: todayAmount, percent: (todayAmount / (invested - todayAmount)) * 100, asOf: today },
    allTime: { amount: invested - cost, percent: ((invested - cost) / cost) * 100, cost, coverage: 1 },
    leagues: [
      { id: "demo-league-1", name: "AI-Infra", emoji: "🤖", rank: 1, members: 8 },
      { id: "demo-league-2", name: "Dorm Room Fund", emoji: "🎓", rank: 3, members: 12 },
    ],
    history: dollarHistory,
    performance: { percent: series[series.length - 1]!.indexed - 100, days: series.length, range, series },
    hasHistory: true,
    firstDate: full[0]!.date,
    isVerified: false,
  }
}

export const DEMO_FANTASY: FantasyRow[] = [
  { id: "demo-fantasy-1", name: "Friday Night Picks", emoji: "🏈", memberCount: 6, yourReturn: 4.21, yourRank: 2, isClosed: false },
  { id: "demo-fantasy-2", name: "Crypto Winter", emoji: "🥶", memberCount: 4, yourReturn: -2.35, yourRank: 3, isClosed: false },
]
