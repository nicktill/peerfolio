/**
 * The numbers behind the portfolio page's headline and holdings table, kept
 * free of database and framework imports so they can be tested directly.
 */

export type PositionInput = {
  securityId: string
  ticker: string | null
  name: string | null
  type: string | null
  quantity: number
  /** Current value of the position. */
  value: number
  /** Total cost, or null/0 when no average cost was entered. */
  costBasis: number | null
  price: number
  /** The close before `price`, when we have seen one. */
  previousClose: number | null
  /** Date of `price` (YYYY-MM-DD). */
  priceAsOf: string | null
}

export type HoldingSummary = {
  securityId: string
  ticker: string | null
  name: string | null
  type: string | null
  quantity: number
  value: number
  /** Share of all holdings by value, 0-100. */
  weight: number
  /** Change since the previous close, in dollars and percent; null when unknown. */
  todayAmount: number | null
  todayPercent: number | null
  /** Gain on the part of the position that has a cost basis; null with none. */
  gainAmount: number | null
  gainPercent: number | null
  /** How many separate positions (accounts) hold this security. */
  positions: number
}

/** One row per security, however many accounts hold it, largest first. */
export function summarizeHoldings(positions: PositionInput[]): HoldingSummary[] {
  const bySecurity = new Map<string, PositionInput[]>()
  for (const p of positions) {
    if (!(p.value > 0)) continue
    const group = bySecurity.get(p.securityId)
    if (group) group.push(p)
    else bySecurity.set(p.securityId, [p])
  }

  const total = [...bySecurity.values()].flat().reduce((sum, p) => sum + p.value, 0)

  const rows = [...bySecurity.values()].map((group) => {
    const first = group[0]!
    const value = group.reduce((sum, p) => sum + p.value, 0)
    const quantity = group.reduce((sum, p) => sum + p.quantity, 0)

    const withPrevious = group.filter((p) => p.previousClose != null && p.previousClose > 0)
    const todayKnown = withPrevious.length === group.length
    const todayAmount = todayKnown ? withPrevious.reduce((sum, p) => sum + p.quantity * (p.price - p.previousClose!), 0) : null
    const previousValue = todayKnown ? withPrevious.reduce((sum, p) => sum + p.quantity * p.previousClose!, 0) : 0

    const withCost = group.filter((p) => p.costBasis != null && p.costBasis > 0)
    const cost = withCost.reduce((sum, p) => sum + p.costBasis!, 0)
    const costedValue = withCost.reduce((sum, p) => sum + p.value, 0)

    return {
      securityId: first.securityId,
      ticker: first.ticker,
      name: first.name,
      type: first.type,
      quantity,
      value,
      weight: total > 0 ? (value / total) * 100 : 0,
      todayAmount,
      todayPercent: todayAmount != null && previousValue > 0 ? (todayAmount / previousValue) * 100 : null,
      gainAmount: cost > 0 ? costedValue - cost : null,
      gainPercent: cost > 0 ? ((costedValue - cost) / cost) * 100 : null,
      positions: group.length,
    }
  })

  return rows.sort((a, b) => b.value - a.value)
}

/**
 * The portfolio's move since the previous close, or null when too little of it
 * has a previous close to say anything honest. `asOf` is the newest price date,
 * so the page can call it "today" only when it is.
 */
export function todayChange(positions: PositionInput[], netWorth: number, minCoverage = 0.9) {
  const priced = positions.filter((p) => p.value > 0)
  const total = priced.reduce((sum, p) => sum + p.value, 0)
  const known = priced.filter((p) => p.previousClose != null && p.previousClose > 0)
  const knownValue = known.reduce((sum, p) => sum + p.value, 0)
  if (known.length === 0 || total <= 0 || knownValue / total < minCoverage) return null

  const amount = known.reduce((sum, p) => sum + p.quantity * (p.price - p.previousClose!), 0)
  const before = netWorth - amount
  const dates = known.map((p) => p.priceAsOf).filter((d): d is string => !!d)
  return {
    amount,
    percent: before > 0 ? (amount / before) * 100 : 0,
    asOf: dates.length > 0 ? dates.reduce((a, b) => (a > b ? a : b)).slice(0, 10) : null,
  }
}

/** Gain since purchase across every position that has an average cost. */
export function allTimeGain(positions: PositionInput[]) {
  const costed = positions.filter((p) => p.value > 0 && p.costBasis != null && p.costBasis > 0)
  const cost = costed.reduce((sum, p) => sum + p.costBasis!, 0)
  if (cost <= 0) return null
  const value = costed.reduce((sum, p) => sum + p.value, 0)
  const total = positions.filter((p) => p.value > 0).reduce((sum, p) => sum + p.value, 0)
  return { amount: value - cost, percent: ((value - cost) / cost) * 100, cost, coverage: total > 0 ? value / total : 0 }
}
