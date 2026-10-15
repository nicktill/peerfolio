import { riskMetrics, type IndexedPoint, type RiskMetrics } from "./risk-metrics.ts"
import { classifyPosition, OTHER_SECTOR } from "./sectors.ts"
import { allTimeGain, summarizeHoldings, todayChange, type HoldingSummary, type PositionInput } from "../dashboard-math.ts"

/**
 * Portfolio X-Ray: every number the assistant may quote about a portfolio,
 * computed here from stored positions. The model explains this result; it never
 * recomputes it. Free of database and framework imports so it can be tested directly.
 */

export type Severity = "info" | "watch" | "notable"

export type Insight = {
  id: string
  severity: Severity
  title: string
  /** One sentence, plain language. */
  summary: string
  /** A supporting figure, already formatted ("34.2% of portfolio"). */
  metric?: string
  followUp: string
}

export type AllocationSlice = { name: string; value: number; percent: number }

export type SectorSlice = {
  name: string
  value: number
  /** Share of the whole portfolio, 0-100. */
  percent: number
  /** A display sector, a fund/crypto/cash bucket (no single sector), or stocks whose sector isn't known. */
  kind: "sector" | "bucket" | "unclassified"
}

export type XRay = {
  /** Newest price date across the holdings (YYYY-MM-DD), or null. */
  asOf: string | null
  overview: {
    totalValue: number
    holdingCount: number
    positionCount: number
    largest: { ticker: string | null; name: string | null; value: number; weight: number }[]
  }
  allocation: AllocationSlice[]
  /** Sector exposure of individual stocks; funds, crypto and cash sit in their own buckets (no look-through). */
  sectors: {
    slices: SectorSlice[]
    /** Value of individual stocks, and the part of it with a mapped sector. */
    stocks: { value: number; classifiedValue: number; holdings: number; classifiedHoldings: number }
    /** Classified share of stock value, 0-100; null when there are no stocks. */
    coverage: number | null
    /** True when coverage is under {@link SECTOR_COVERAGE_MIN}. */
    partial: boolean
    /** Largest mapped sector with its share of classified stock value (0-100). */
    largest: { name: string; percentOfClassified: number; percentOfPortfolio: number } | null
  }
  concentration: {
    top1: number
    top3: number
    top5: number
    /** Herfindahl index on weights, 0-1. */
    hhi: number
    /** 1 / HHI: how many equally sized holdings would be as concentrated. */
    effectiveHoldings: number
    /** Combined weight of individual stocks (type "equity"), 0-100. */
    singleStockWeight: number
    /** Securities held in more than one account. */
    multiAccount: { ticker: string | null; name: string | null; accounts: number; weight: number }[]
  }
  performance: {
    today: { amount: number; percent: number | null } | null
    allTime: { amount: number; percent: number | null; coverage: number } | null
    /** Time-weighted return over the window, net of deposits, when history supports it. */
    period: { percent: number; days: number; range: string } | null
    movers: { ticker: string | null; name: string | null; todayAmount: number }[]
    /** Volatility and drawdown of the time-weighted series over the same window; null without history. */
    risk: RiskMetrics | null
  }
  risks: Insight[]
  nextSteps: Insight[]
  /** What this analysis could not see, stated rather than guessed. */
  limitations: string[]
}

/** A position plus the display sector of its security, when known. */
export type XRayPosition = PositionInput & { sector?: string | null }

export type XRayInput = {
  positions: XRayPosition[]
  period?: { percent: number | null; days: number; range: string } | null
  /** The time-weighted series behind `period`, for volatility and drawdown. */
  series?: IndexedPoint[]
}

/** Thresholds are heuristics for flagging, not rules; the summaries say so. */
export const LIMITS = { notableHolding: 25, watchHolding: 15, notableTop5: 70, watchTop5: 55, notableStocks: 60, fewHoldings: 5 } as const

/** A sector this large a share of classified stock value is worth naming; a heuristic, like the other thresholds. */
export const SECTOR_WATCH = 40
/** Below this share of stock value with a sector, exposure is called partial; a heuristic. */
export const SECTOR_COVERAGE_MIN = 60
/** Fewer classified holdings than this say little about sector tilt (one stock is its own sector). */
export const SECTOR_MIN_HOLDINGS = 3

/** A fall this deep over the window is worth naming; a heuristic, like the other thresholds. */
export const DRAWDOWN_WATCH = 15

const SECURITY_LABELS: Record<string, string> = {
  fund: "Plan funds",
  equity: "Stocks",
  etf: "ETFs",
  mutual_fund: "Mutual funds",
  fixed_income: "Bonds",
  cash: "Cash",
  derivative: "Derivatives",
  cryptocurrency: "Crypto",
  other: "Other",
}

const pct = (n: number) => `${n.toFixed(1)}%`
const label = (h: { ticker: string | null; name: string | null }) => h.ticker ?? h.name ?? "a holding"

export function allocate(positions: PositionInput[]): AllocationSlice[] {
  const byLabel = new Map<string, number>()
  let total = 0
  for (const p of positions) {
    if (!(p.value > 0)) continue
    const name = SECURITY_LABELS[p.type ?? "other"] ?? "Other"
    byLabel.set(name, (byLabel.get(name) ?? 0) + p.value)
    total += p.value
  }
  return [...byLabel.entries()]
    .map(([name, value]) => ({ name, value, percent: total > 0 ? (value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
}

export function analyzeSectors(positions: XRayPosition[]): XRay["sectors"] {
  const bySlice = new Map<string, SectorSlice>()
  const stockIds = new Set<string>()
  const classifiedIds = new Set<string>()
  let total = 0
  let stockValue = 0
  let classifiedValue = 0
  for (const p of positions) {
    if (!(p.value > 0)) continue
    total += p.value
    const bucket = classifyPosition(p.type, p.sector ?? null)
    const slice = bySlice.get(bucket.name) ?? { name: bucket.name, value: 0, percent: 0, kind: bucket.kind === "sector" ? "sector" : bucket.kind }
    slice.value += p.value
    bySlice.set(bucket.name, slice)
    if (p.type === "equity") {
      stockValue += p.value
      stockIds.add(p.securityId)
      if (bucket.kind === "sector" && bucket.name !== OTHER_SECTOR) {
        classifiedValue += p.value
        classifiedIds.add(p.securityId)
      }
    }
  }
  const slices = [...bySlice.values()]
    .map((sl) => ({ ...sl, percent: total > 0 ? (sl.value / total) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)
  const coverage = stockValue > 0 ? (classifiedValue / stockValue) * 100 : null
  const top = slices.find((sl) => sl.kind === "sector" && sl.name !== OTHER_SECTOR)
  return {
    slices,
    stocks: { value: stockValue, classifiedValue, holdings: stockIds.size, classifiedHoldings: classifiedIds.size },
    coverage,
    partial: coverage != null && coverage < SECTOR_COVERAGE_MIN,
    largest: top && classifiedValue > 0 ? { name: top.name, percentOfClassified: (top.value / classifiedValue) * 100, percentOfPortfolio: top.percent } : null,
  }
}

function sumWeights(rows: HoldingSummary[], n: number) {
  return rows.slice(0, n).reduce((sum, r) => sum + r.weight, 0)
}

export function analyzeConcentration(rows: HoldingSummary[]): XRay["concentration"] {
  const weights = rows.map((r) => r.weight / 100)
  const hhi = weights.reduce((sum, w) => sum + w * w, 0)
  return {
    top1: sumWeights(rows, 1),
    top3: sumWeights(rows, 3),
    top5: sumWeights(rows, 5),
    hhi,
    effectiveHoldings: hhi > 0 ? 1 / hhi : 0,
    singleStockWeight: rows.filter((r) => r.type === "equity").reduce((sum, r) => sum + r.weight, 0),
    multiAccount: rows.filter((r) => r.positions > 1).map((r) => ({ ticker: r.ticker, name: r.name, accounts: r.positions, weight: r.weight })),
  }
}

function sectorLimitation({ coverage, partial, stocks }: XRay["sectors"]): string {
  const funds = "Funds, crypto and cash are grouped in their own buckets; fund look-through into underlying sectors isn't available."
  if (coverage == null) return `Sector exposure isn't shown: you hold no individual stocks, and ${funds.charAt(0).toLowerCase()}${funds.slice(1)}`
  if (stocks.classifiedValue === 0) return `Sector exposure isn't shown yet: Peerfolio doesn't have sector data for your stocks so far. ${funds}`
  if (partial) return `Sector exposure is partial: sector data covers ${pct(coverage)} of your stock value, so the shares shown are of that part only. ${funds}`
  return `Sectors cover individual stocks only. ${funds}`
}

export function buildXRay({ positions, period = null, series = [] }: XRayInput): XRay {
  const rows = summarizeHoldings(positions)
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0)
  const concentration = analyzeConcentration(rows)
  const allocation = allocate(positions)
  const sectors = analyzeSectors(positions)
  const asOf = positions.map((p) => p.priceAsOf).filter((d): d is string => !!d).sort().at(-1) ?? null

  const today = todayChange(positions, totalValue)
  const gain = allTimeGain(positions)

  const movers = rows
    .filter((r) => r.todayAmount != null)
    .sort((a, b) => Math.abs(b.todayAmount!) - Math.abs(a.todayAmount!))
    .slice(0, 3)
    .map((r) => ({ ticker: r.ticker, name: r.name, todayAmount: r.todayAmount! }))

  const risks: Insight[] = []
  const nextSteps: Insight[] = []
  const top = rows[0]

  if (top) {
    if (top.weight >= LIMITS.notableHolding) {
      risks.push({
        id: "single-holding",
        severity: "notable",
        title: `${label(top)} is a large share of the portfolio`,
        summary: `One holding makes up ${pct(top.weight)} of what you hold, so its moves drive much of your result.`,
        metric: `${pct(top.weight)} in ${label(top)}`,
        followUp: `How much of my performance comes from ${label(top)}?`,
      })
      nextSteps.push({
        id: "review-top",
        severity: "info",
        title: `Review your ${label(top)} position`,
        summary: "Check whether a position this size matches how much you intend to rely on a single holding.",
        followUp: `What would my portfolio look like if ${label(top)} fell 20%?`,
      })
    } else if (top.weight >= LIMITS.watchHolding) {
      risks.push({
        id: "single-holding",
        severity: "watch",
        title: `${label(top)} leads your holdings`,
        summary: `Your largest holding is ${pct(top.weight)} of the portfolio.`,
        metric: `${pct(top.weight)} in ${label(top)}`,
        followUp: `Tell me more about my ${label(top)} exposure.`,
      })
    }
  }

  // With few holdings the top five is most of the portfolio by arithmetic, so it only says something past ten.
  if (rows.length >= 10 && concentration.top5 >= LIMITS.watchTop5) {
    risks.push({
      id: "top-five",
      severity: concentration.top5 >= LIMITS.notableTop5 ? "notable" : "watch",
      title: "A few holdings carry most of the portfolio",
      summary: `Your five largest holdings are ${pct(concentration.top5)} of the total.`,
      metric: `Top 5 = ${pct(concentration.top5)}`,
      followUp: "Which of my top holdings overlap the most?",
    })
  }

  if (rows.length > 0 && rows.length < LIMITS.fewHoldings) {
    risks.push({
      id: "few-holdings",
      severity: "watch",
      title: "Few separate holdings",
      summary: `You hold ${rows.length} distinct ${rows.length === 1 ? "security" : "securities"}, so each one matters a lot. A broad fund counts as one holding but spreads across many companies.`,
      metric: `${rows.length} holdings`,
      followUp: "How diversified is my portfolio?",
    })
  }

  if (concentration.singleStockWeight >= LIMITS.notableStocks) {
    risks.push({
      id: "single-stocks",
      severity: "watch",
      title: "Mostly individual stocks",
      summary: `Individual stocks are ${pct(concentration.singleStockWeight)} of the portfolio; funds hold more companies per dollar.`,
      metric: `${pct(concentration.singleStockWeight)} in stocks`,
      followUp: "What share of my portfolio is in funds versus individual stocks?",
    })
  }

  if (concentration.multiAccount.length > 0) {
    const first = concentration.multiAccount[0]!
    nextSteps.push({
      id: "multi-account",
      severity: "info",
      title: "Same holding in several accounts",
      summary: `${label(first)} appears in ${first.accounts} accounts. Peerfolio combines them here; your real exposure is the sum.`,
      followUp: "Which holdings do I own in more than one account?",
    })
  }

  if (period && period.percent != null) {
    nextSteps.push({
      id: "benchmark",
      severity: "info",
      title: "Compare against a benchmark",
      summary: "Put your return next to a broad index over the same dates to see whether picks or the market drove it.",
      followUp: "How do I compare with the S&P 500?",
    })
  }

  const risk = riskMetrics(series)
  if (risk?.maxDrawdown != null && risk.maxDrawdown >= DRAWDOWN_WATCH) {
    risks.push({
      id: "drawdown",
      severity: "watch",
      title: "A meaningful drop in this window",
      summary: `Net of deposits, the portfolio fell ${pct(risk.maxDrawdown)} from its peak at the worst point.`,
      metric: `Max drawdown ${pct(risk.maxDrawdown)}`,
      followUp: "What drove my biggest drop?",
    })
  }

  const { largest } = sectors
  if (largest && largest.percentOfClassified >= SECTOR_WATCH && sectors.stocks.classifiedHoldings >= SECTOR_MIN_HOLDINGS) {
    risks.push({
      id: "sector-tilt",
      severity: "watch",
      title: `${largest.name} is the biggest sector in your stocks`,
      summary: `${largest.name} is ${pct(largest.percentOfClassified)} of the stock value that has sector data${sectors.partial ? " (partial coverage, so the real share may differ)" : ""}. A heavy tilt means one part of the market drives much of your stock results; ${SECTOR_WATCH}% is a rule-of-thumb threshold, not a rule.`,
      metric: `${pct(largest.percentOfClassified)} ${largest.name}`,
      followUp: `How exposed am I to ${largest.name}?`,
    })
  }

  const limitations = [
    sectorLimitation(sectors),
    "Fund overlap isn't shown: underlying fund constituents aren't available.",
    "Correlations between holdings aren't estimated.",
  ]
  if (risk?.volatility == null) limitations.push("Volatility needs about a month of tracked daily history.")
  if (!period || period.percent == null) limitations.push("Period performance needs more tracked history than this portfolio has so far.")
  if (positions.some((p) => !(p.costBasis && p.costBasis > 0))) limitations.push("Gain figures only cover positions that have a cost basis.")

  return {
    asOf,
    overview: {
      totalValue,
      holdingCount: rows.length,
      positionCount: positions.filter((p) => p.value > 0).length,
      largest: rows.slice(0, 5).map((r) => ({ ticker: r.ticker, name: r.name, value: r.value, weight: r.weight })),
    },
    allocation,
    sectors,
    concentration,
    performance: {
      today: today ? { amount: today.amount, percent: today.percent } : null,
      allTime: gain ? { amount: gain.amount, percent: gain.percent, coverage: gain.coverage } : null,
      period: period && period.percent != null ? { percent: period.percent, days: period.days, range: period.range } : null,
      movers,
      risk,
    },
    risks,
    nextSteps,
    limitations,
  }
}
