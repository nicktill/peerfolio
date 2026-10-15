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
  }
  risks: Insight[]
  nextSteps: Insight[]
  /** What this analysis could not see, stated rather than guessed. */
  limitations: string[]
}

export type XRayInput = {
  positions: PositionInput[]
  period?: { percent: number | null; days: number; range: string } | null
}

/** Thresholds are heuristics for flagging, not rules; the summaries say so. */
export const LIMITS = { notableHolding: 25, watchHolding: 15, notableTop5: 70, watchTop5: 55, notableStocks: 60, fewHoldings: 5 } as const

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

export function buildXRay({ positions, period = null }: XRayInput): XRay {
  const rows = summarizeHoldings(positions)
  const totalValue = rows.reduce((sum, r) => sum + r.value, 0)
  const concentration = analyzeConcentration(rows)
  const allocation = allocate(positions)
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

  const limitations = [
    "Sector exposure isn't shown: Peerfolio doesn't have reliable sector data for your holdings.",
    "Fund overlap isn't shown: underlying fund constituents aren't available.",
    "Volatility and correlation aren't estimated from allocation alone.",
  ]
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
    concentration,
    performance: {
      today: today ? { amount: today.amount, percent: today.percent } : null,
      allTime: gain ? { amount: gain.amount, percent: gain.percent, coverage: gain.coverage } : null,
      period: period && period.percent != null ? { percent: period.percent, days: period.days, range: period.range } : null,
      movers,
    },
    risks,
    nextSteps,
    limitations,
  }
}
