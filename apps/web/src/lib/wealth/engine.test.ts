import { test } from "node:test"
import assert from "node:assert/strict"
import {
  MAX_YEARS,
  monthlyRate,
  monthsToReachTarget,
  normalizeInputs,
  project,
  requiredMonthlyContribution,
  scenarios,
  yearsSaved,
  type WealthInputs,
} from "./engine.ts"

const base: WealthInputs = {
  startingValue: 10_000,
  monthlyContribution: 500,
  annualContributionGrowthPct: 0,
  years: 20,
  expectedAnnualReturnPct: 7,
  inflationPct: 2.5,
  targetValue: 500_000,
}
const close = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} !~ ${b}`)

test("twelve monthly steps compound to exactly the annual return", () => {
  close(Math.pow(1 + monthlyRate(7), 12), 1.07, 1e-12)
})

test("zero return is a simple sum", () => {
  const p = project({ ...base, expectedAnnualReturnPct: 0 })
  close(p.summary.finalNominal, 10_000 + 500 * 240)
  close(p.summary.totalGrowth, 0, 1e-9)
  close(p.summary.totalContributions, 120_000)
})

test("zero contributions is pure compounding", () => {
  const p = project({ ...base, monthlyContribution: 0 })
  close(p.summary.finalNominal, 10_000 * Math.pow(1.07, 20), 1e-9)
  assert.equal(p.summary.totalContributions, 0)
})

test("inflation 0 makes real equal nominal at every month", () => {
  const p = project({ ...base, inflationPct: 0 })
  for (const pt of p.points) close(pt.real, pt.nominal, 1e-12)
})

test("growth = value - start - contributions, and series has months+1 points", () => {
  const p = project(base)
  assert.equal(p.points.length, 241)
  for (const pt of p.points) close(pt.growth, pt.nominal - 10_000 - pt.contributions, 1e-9)
  assert.equal(p.points[0]!.nominal, 10_000)
  assert.equal(p.points[0]!.contributions, 0)
})

test("real value is deflated by (1+i)^(m/12)", () => {
  const p = project(base)
  const last = p.points[240]!
  close(last.real, last.nominal / Math.pow(1.025, 20), 1e-12)
})

test("contribution growth steps up annually, starting in month 13", () => {
  const p = project({ ...base, expectedAnnualReturnPct: 0, annualContributionGrowthPct: 10, years: 2, startingValue: 0 })
  close(p.points[12]!.contributions, 6_000)
  close(p.points[24]!.contributions, 6_000 + 12 * 550)
})

test("final value is monotonic in expected return", () => {
  let prev = -Infinity
  for (const r of [-5, -1, 0, 1, 3, 7, 12]) {
    const v = project({ ...base, expectedAnnualReturnPct: r }).summary.finalNominal
    assert.ok(v > prev)
    prev = v
  }
})

test("required monthly contribution round-trips through the forward simulation", () => {
  for (const [target, years, r, g] of [[500_000, 20, 7, 0], [1_000_000, 30, 5, 3], [2_000_000, 15, 0, 0], [100_000, 5, 9, 2]] as const) {
    const input = { ...base, expectedAnnualReturnPct: r, annualContributionGrowthPct: g }
    const c = requiredMonthlyContribution(target, years, input)!
    assert.ok(c > 0)
    const p = project({ ...input, years, monthlyContribution: c })
    close(p.summary.finalNominal, target, 1e-9)
  }
})

test("required contribution is 0 when the starting value already gets there, null with no months", () => {
  assert.equal(requiredMonthlyContribution(15_000, 10, base), 0)
  assert.equal(requiredMonthlyContribution(1_000_000, 0, base), null)
  assert.equal(requiredMonthlyContribution(5_000, 0, base), 0)
})

test("monthsToTarget matches the forward simulation and respects the horizon", () => {
  const input = { ...base, targetValue: 200_000 }
  const p = project(input)
  const m = p.summary.monthsToTarget!
  assert.ok(p.points[m]!.nominal >= 200_000)
  assert.ok(p.points[m - 1]!.nominal < 200_000)
  assert.equal(monthsToReachTarget(input), m)
  const short = project({ ...input, years: 5 })
  assert.equal(short.summary.monthsToTarget, null)
  assert.equal(monthsToReachTarget({ ...input, years: 5 }), m)
})

test("target already met is month 0; no target gives null", () => {
  assert.equal(project({ ...base, targetValue: 5_000 }).summary.monthsToTarget, 0)
  assert.equal(project({ ...base, targetValue: null }).summary.monthsToTarget, null)
  assert.equal(project({ ...base, targetValue: undefined }).summary.progress, null)
})

test("never reaching the target is null, including in the extended search", () => {
  assert.equal(monthsToReachTarget({ ...base, startingValue: 0, monthlyContribution: 0, targetValue: 1000 }), null)
})

test("yearsSaved is the difference in months and positive for a positive extra", () => {
  const r = yearsSaved(200, base)
  assert.equal(r.monthsSaved, r.baseMonths! - r.withExtraMonths!)
  assert.ok(r.monthsSaved! > 0)
  assert.equal(yearsSaved(0, base).monthsSaved, 0)
  const bigger = yearsSaved(500, base)
  assert.ok(bigger.monthsSaved! >= r.monthsSaved!)
})

test("yearsSaved flags a target reachable only with the extra", () => {
  const r = yearsSaved(1000, { ...base, startingValue: 0, monthlyContribution: 0, expectedAnnualReturnPct: 0, targetValue: 1_000_000 })
  assert.equal(r.baseMonths, null)
  assert.equal(r.onlyWithExtra, true)
  assert.equal(r.monthsSaved, null)
})

test("scenarios: base equals project, spread applied, ordered", () => {
  const s = scenarios(base)
  assert.equal(s.spread, 2)
  assert.deepEqual(s.base.summary, project(base).summary)
  assert.equal(s.conservative.inputs.expectedAnnualReturnPct, 5)
  assert.equal(s.optimistic.inputs.expectedAnnualReturnPct, 9)
  assert.ok(s.conservative.summary.finalNominal < s.base.summary.finalNominal)
  assert.ok(s.base.summary.finalNominal < s.optimistic.summary.finalNominal)
  assert.equal(scenarios(base, 0).conservative.summary.finalNominal, project(base).summary.finalNominal)
  assert.equal(scenarios(base, -3).spread, 0)
})

test("edge cases: zero years", () => {
  const p = project({ ...base, years: 0 })
  assert.equal(p.points.length, 1)
  assert.equal(p.summary.finalNominal, 10_000)
  assert.equal(p.summary.totalContributions, 0)
})

test("edge cases: negatives are clamped, NaN is 0, years capped, rates floored", () => {
  const n = normalizeInputs({ startingValue: -5, monthlyContribution: NaN, annualContributionGrowthPct: -500, years: 1000, expectedAnnualReturnPct: -100, inflationPct: Infinity, targetValue: -1 })
  assert.equal(n.startingValue, 0)
  assert.equal(n.monthlyContribution, 0)
  assert.equal(n.annualContributionGrowthPct, -99)
  assert.equal(n.years, MAX_YEARS)
  assert.equal(n.expectedAnnualReturnPct, -99)
  assert.equal(n.inflationPct, 0)
  assert.equal(n.targetValue, 0)
  const p = project({ ...base, expectedAnnualReturnPct: -100 })
  assert.ok(Number.isFinite(p.summary.finalNominal))
})

test("fractional years round to whole months", () => {
  assert.equal(project({ ...base, years: 1.5 }).months, 18)
})

test("progress is final / target", () => {
  const p = project(base)
  close(p.summary.progress!, p.summary.finalNominal / 500_000, 1e-12)
})
