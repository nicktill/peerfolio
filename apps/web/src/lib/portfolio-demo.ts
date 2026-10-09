import type { FantasyRow, PortfolioResponse } from "@web/components/dashboard/portfolio-screen"
import type { AccountRow } from "@web/components/dashboard/accounts-card"
import type { HoldingRow } from "@web/components/dashboard/holdings-table"
import type { Range } from "@web/lib/ranges"

/**
 * An invented portfolio for the sign-in-free preview of the Portfolio page:
 * a brokerage account, a Roth IRA, a 401(k) and cash, with a year of history.
 * Nothing here belongs to a real person.
 */

type Lot = { ticker: string; name: string; kind?: "stock" | "crypto"; quantity: number; price: number; cost: number; today: number }

const ETFS = new Set(["VTI", "SCHD", "VXUS", "QQQM", "VTSAX"])

const ACCOUNTS: { id: string; name: string; institution: string; category: "investment" | "cash"; cash?: number; lots: Lot[] }[] = [
  {
    id: "demo-brokerage",
    name: "Brokerage",
    institution: "Charles Schwab",
    category: "investment",
    lots: [
      { ticker: "MSFT", name: "Microsoft", quantity: 14, price: 512.3, cost: 5_350, today: 0.36 },
      { ticker: "V", name: "Visa", quantity: 12, price: 341.2, cost: 3_300, today: 0.28 },
      { ticker: "COST", name: "Costco", quantity: 3, price: 918.4, cost: 2_420, today: 0.18 },
      { ticker: "DIS", name: "Walt Disney", quantity: 20, price: 112.6, cost: 2_180, today: -0.55 },
      { ticker: "SBUX", name: "Starbucks", quantity: 25, price: 86.4, cost: 2_610, today: -0.72 },
      { ticker: "NKE", name: "Nike", quantity: 18, price: 71.9, cost: 1_580, today: 0.9 },
      { ticker: "JNJ", name: "Johnson & Johnson", quantity: 10, price: 178.3, cost: 1_520, today: 0.12 },
      { ticker: "KO", name: "Coca-Cola", quantity: 40, price: 69.8, cost: 2_380, today: 0.05 },
    ],
  },
  {
    id: "demo-roth",
    name: "Roth IRA",
    institution: "E*TRADE",
    category: "investment",
    lots: [
      { ticker: "SCHD", name: "Schwab U.S. Dividend Equity ETF", quantity: 220, price: 28.1, cost: 5_200, today: 0.31 },
      { ticker: "VTI", name: "Vanguard Total Stock Market ETF", quantity: 24, price: 331.4, cost: 6_040, today: 0.4 },
      { ticker: "VXUS", name: "Vanguard Total International Stock ETF", quantity: 60, price: 74.2, cost: 3_700, today: 0.22 },
      { ticker: "QQQM", name: "Invesco NASDAQ 100 ETF", quantity: 14, price: 247.5, cost: 2_600, today: 0.68 },
    ],
  },
  {
    id: "demo-401k",
    name: "401(k)",
    institution: "Empower",
    category: "investment",
    lots: [{ ticker: "VTSAX", name: "Vanguard Total Stock Market Index Admiral", quantity: 160, price: 156.4, cost: 19_800, today: 0.4 }],
  },
  { id: "demo-cash", name: "Everyday checking", institution: "Chase", category: "cash", cash: 3_860.17, lots: [] },
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
    if (i > 0) level *= 1 + (rand() - 0.44) * 0.011
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
      kind: l.kind ?? ("stock" as const),
      quantity: l.quantity,
      price: l.price,
      value: round2(l.quantity * l.price),
      costBasis: l.cost,
      priceAsOf: today,
    }))
    return {
      id: a.id,
      name: a.name,
      mask: null,
      category: a.category,
      balance: a.cash ?? positions.reduce((sum, p) => sum + p.value, 0),
      isLiability: false,
      source: "manual" as const,
      institutionName: a.institution,
      institutionLogo: null,
      itemId: null,
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
      type: r.lot.kind === "crypto" ? "cryptocurrency" : ETFS.has(r.lot.ticker) ? "etf" : "equity",
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

  const kindOf = (h: HoldingRow) => (h.type === "cryptocurrency" ? "Crypto" : h.type === "etf" ? "ETFs" : "Stocks")
  const allocation = ["Stocks", "ETFs", "Crypto"]
    .map((name) => {
      const value = holdings.filter((h) => kindOf(h) === name).reduce((sum, h) => sum + h.value, 0)
      return { name, value, percent: (value / invested) * 100 }
    })
    .filter((s) => s.value > 0)
    .sort((a, b) => b.value - a.value)

  const netWorth = accounts.reduce((sum, a) => sum + a.balance, 0)
  const cash = netWorth - invested

  // The dollar series follows the same market path, plus a $5,000 deposit 15
  // sessions ago: value steps up on that day, the time-weighted return doesn't.
  const DEPOSIT = 5_000
  const depositDate = full[full.length - 15]!.date
  const last = full[full.length - 1]!.level
  const dollarHistory = window.map((p) => {
    const investableAssets = (invested - (p.date < depositDate ? DEPOSIT : 0)) * (p.level / last)
    return { date: p.date, netWorth: investableAssets + cash, investableAssets }
  })
  const todayAmount = holdings.reduce((sum, h) => sum + (h.todayAmount ?? 0), 0)
  const cost = holdings.reduce((sum, h) => sum + (h.value - (h.gainAmount ?? 0)), 0)

  return {
    summary: { totalAssets: netWorth, totalLiabilities: 0, netWorth, investableAssets: invested },
    accounts,
    items: [],
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
