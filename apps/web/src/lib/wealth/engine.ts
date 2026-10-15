/**
 * Wealth Lab projection engine. Pure and deterministic: no randomness, no I/O.
 *
 * Model
 *  - Monthly steps. The monthly rate is (1 + annual)^(1/12) - 1, so twelve months compound to exactly the annual return.
 *  - Contributions land at month end, after that month's growth.
 *  - The monthly contribution steps up once a year: months 1-12 use `monthlyContribution`, months 13-24 use
 *    `monthlyContribution * (1 + annualContributionGrowthPct/100)`, and so on.
 *  - Real value = nominal / (1 + inflation)^(month/12).
 *  - Growth = value - startingValue - cumulative contributions.
 *
 * Input rules (`normalizeInputs`): nothing throws.
 *  - Non-finite numbers become 0.
 *  - startingValue, monthlyContribution, targetValue and years are clamped to >= 0 (negatives are not supported).
 *  - years is rounded to whole months (years * 12) and capped at MAX_YEARS.
 *  - Returns, contribution growth and inflation are floored at MIN_RATE_PCT (-99), so (1 + rate) stays positive.
 *  - A targetValue of 0 means "no target".
 *  - With 0 months there is a single point (month 0) and no contributions.
 */

export const MAX_YEARS = 100
export const MIN_RATE_PCT = -99
export const DEFAULT_SCENARIO_SPREAD = 2

export type WealthInputs = {
  startingValue: number
  monthlyContribution: number
  annualContributionGrowthPct: number
  years: number
  expectedAnnualReturnPct: number
  inflationPct: number
  targetValue?: number | null
}

export type ProjectionPoint = {
  month: number
  nominal: number
  real: number
  contributions: number
  growth: number
}

export type ProjectionSummary = {
  finalNominal: number
  finalReal: number
  totalContributions: number
  totalGrowth: number
  /** First month (0 = already there) the nominal value reaches the target within the horizon; null if never or no target. */
  monthsToTarget: number | null
  /** finalNominal / target, uncapped; null without a target. */
  progress: number | null
}

export type Projection = {
  inputs: NormalizedInputs
  months: number
  /** months + 1 points, from month 0 (the starting value) to the last month. */
  points: ProjectionPoint[]
  summary: ProjectionSummary
}

export type NormalizedInputs = Required<Omit<WealthInputs, "targetValue">> & { targetValue: number }

function finite(n: number): number {
  return Number.isFinite(n) ? n : 0
}
const nonNegative = (n: number) => Math.max(0, finite(n))
const rate = (n: number) => Math.max(MIN_RATE_PCT, finite(n))

export function normalizeInputs(input: WealthInputs): NormalizedInputs {
  return {
    startingValue: nonNegative(input.startingValue),
    monthlyContribution: nonNegative(input.monthlyContribution),
    annualContributionGrowthPct: rate(input.annualContributionGrowthPct),
    years: Math.min(MAX_YEARS, nonNegative(input.years)),
    expectedAnnualReturnPct: rate(input.expectedAnnualReturnPct),
    inflationPct: rate(input.inflationPct),
    targetValue: nonNegative(input.targetValue ?? 0),
  }
}

export const monthlyRate = (annualPct: number) => Math.pow(1 + annualPct / 100, 1 / 12) - 1
const monthsFor = (years: number) => Math.round(years * 12)

/** Contribution made at the end of 1-based `month`. */
function contributionAt(n: NormalizedInputs, month: number): number {
  return n.monthlyContribution * Math.pow(1 + n.annualContributionGrowthPct / 100, Math.floor((month - 1) / 12))
}

/** Full month-by-month projection over the input horizon. */
export function project(input: WealthInputs): Projection {
  const n = normalizeInputs(input)
  const months = monthsFor(n.years)
  const rm = monthlyRate(n.expectedAnnualReturnPct)
  const infl = 1 + n.inflationPct / 100

  const points: ProjectionPoint[] = [{ month: 0, nominal: n.startingValue, real: n.startingValue, contributions: 0, growth: 0 }]
  let value = n.startingValue
  let contributed = 0
  for (let m = 1; m <= months; m++) {
    const c = contributionAt(n, m)
    value = value * (1 + rm) + c
    contributed += c
    points.push({
      month: m,
      nominal: value,
      real: value / Math.pow(infl, m / 12),
      contributions: contributed,
      growth: value - n.startingValue - contributed,
    })
  }

  const last = points[points.length - 1]!
  const hasTarget = n.targetValue > 0
  const reached = hasTarget ? points.find((p) => p.nominal >= n.targetValue) : undefined
  return {
    inputs: n,
    months,
    points,
    summary: {
      finalNominal: last.nominal,
      finalReal: last.real,
      totalContributions: last.contributions,
      totalGrowth: last.growth,
      monthsToTarget: reached ? reached.month : null,
      progress: hasTarget ? last.nominal / n.targetValue : null,
    },
  }
}

/** Nominal value after `months` months, without allocating the series. */
function finalValue(n: NormalizedInputs, months: number): number {
  const rm = monthlyRate(n.expectedAnnualReturnPct)
  let value = n.startingValue
  for (let m = 1; m <= months; m++) value = value * (1 + rm) + contributionAt(n, m)
  return value
}

/**
 * Monthly contribution (today's amount, still stepping up by the contribution growth) needed for the nominal
 * value to reach `target` after `years`. The final value is exactly linear in the contribution,
 * V(c) = V(0) + c * (V(1) - V(0)), so this is closed form (two simulations, no search).
 * Returns 0 when the starting value alone gets there, and null when the horizon has no months to contribute in.
 */
export function requiredMonthlyContribution(target: number, years: number, input: Omit<WealthInputs, "years" | "targetValue">): number | null {
  const n = normalizeInputs({ ...input, years, targetValue: target })
  const months = monthsFor(n.years)
  const goal = n.targetValue
  const base = finalValue({ ...n, monthlyContribution: 0 }, months)
  if (base >= goal) return 0
  if (months === 0) return null
  const perDollar = finalValue({ ...n, monthlyContribution: 1 }, months) - base
  return (goal - base) / perDollar
}

/** Months until the nominal value reaches the target, searching up to MAX_YEARS (not just the input horizon). */
export function monthsToReachTarget(input: WealthInputs): number | null {
  const n = normalizeInputs(input)
  if (n.targetValue <= 0) return null
  if (n.startingValue >= n.targetValue) return 0
  const rm = monthlyRate(n.expectedAnnualReturnPct)
  let value = n.startingValue
  for (let m = 1; m <= MAX_YEARS * 12; m++) {
    value = value * (1 + rm) + contributionAt(n, m)
    if (value >= n.targetValue) return m
  }
  return null
}

export type YearsSaved = {
  baseMonths: number | null
  withExtraMonths: number | null
  /** baseMonths - withExtraMonths. Null when either never reaches the target within MAX_YEARS; if only the extra reaches it, see `onlyWithExtra`. */
  monthsSaved: number | null
  onlyWithExtra: boolean
}

/** How much sooner the target arrives if `extraMonthly` is added to the monthly contribution. */
export function yearsSaved(extraMonthly: number, input: WealthInputs): YearsSaved {
  const baseMonths = monthsToReachTarget(input)
  const withExtraMonths = monthsToReachTarget({ ...input, monthlyContribution: nonNegative(input.monthlyContribution) + nonNegative(extraMonthly) })
  return {
    baseMonths,
    withExtraMonths,
    monthsSaved: baseMonths != null && withExtraMonths != null ? baseMonths - withExtraMonths : null,
    onlyWithExtra: baseMonths == null && withExtraMonths != null,
  }
}

export type ScenarioSet = {
  spread: number
  conservative: Projection
  base: Projection
  optimistic: Projection
}

/** Base return, minus and plus `spread` percentage points (default 2). The spread itself is floored at 0. */
export function scenarios(input: WealthInputs, spread: number = DEFAULT_SCENARIO_SPREAD): ScenarioSet {
  const s = nonNegative(spread)
  const r = finite(input.expectedAnnualReturnPct)
  return {
    spread: s,
    conservative: project({ ...input, expectedAnnualReturnPct: r - s }),
    base: project(input),
    optimistic: project({ ...input, expectedAnnualReturnPct: r + s }),
  }
}
