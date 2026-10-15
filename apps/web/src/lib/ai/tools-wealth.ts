import "server-only"
import { loadPositions } from "@web/lib/ai/portfolio-data"
import { DEFAULT_SCENARIO_SPREAD, monthsToReachTarget, requiredMonthlyContribution, scenarios, yearsSaved, type WealthInputs } from "@web/lib/wealth/engine"
import { decodeWealthParams, encodeWealthParams, wealthLabUrl } from "@web/lib/wealth/link"

/**
 * The assistant's Wealth Lab tool. Every figure comes from the deterministic engine; the model only
 * supplies assumptions. Assumptions are clamped by the same decoder the page uses, so what the assistant
 * computed is exactly what the link opens.
 */

/** The tool definition lives in tool-defs.ts (pure, so it can be tested); only the runner is here. */

const DEFAULTS = { monthlyContribution: 1_000, annualContributionGrowthPct: 3, years: 25, expectedAnnualReturnPct: 7, inflationPct: 2.5, spread: DEFAULT_SCENARIO_SPREAD }
const FIELDS = ["startingValue", "monthlyContribution", "annualContributionGrowthPct", "years", "expectedAnnualReturnPct", "inflationPct", "targetValue", "spread"] as const

const round = (v: number, places = 0) => Math.round(v * 10 ** places) / 10 ** places
const years = (months: number | null) => (months == null ? null : round(months / 12, 1))

export async function runProjectWealth(rawArgs: string, ctx: { userId: string; emit: (event: { type: "link"; label: string; href: string }) => void }): Promise<unknown> {
  let args: Record<string, unknown> = {}
  try {
    const parsed: unknown = JSON.parse(rawArgs)
    if (parsed && typeof parsed === "object") args = parsed as Record<string, unknown>
  } catch {
    // Bad arguments fall back to defaults.
  }
  const given = new URLSearchParams()
  for (const k of FIELDS) {
    const v = args[k]
    if (typeof v === "number" && Number.isFinite(v)) given.set(k, String(Math.max(0, v)))
  }
  // Same validation and clamping as the page applies to a link.
  const clean = decodeWealthParams(given) ?? {}

  let startingValue = clean.startingValue
  let importedStart = false
  if (startingValue == null) {
    startingValue = Math.round((await loadPositions(ctx.userId)).reduce((sum, p) => sum + (Number.isFinite(p.value) ? p.value : 0), 0))
    importedStart = true
  }
  const inputs: WealthInputs = {
    startingValue,
    monthlyContribution: clean.monthlyContribution ?? DEFAULTS.monthlyContribution,
    annualContributionGrowthPct: clean.annualContributionGrowthPct ?? DEFAULTS.annualContributionGrowthPct,
    years: Math.max(1, clean.years ?? DEFAULTS.years),
    expectedAnnualReturnPct: clean.expectedAnnualReturnPct ?? DEFAULTS.expectedAnnualReturnPct,
    inflationPct: clean.inflationPct ?? DEFAULTS.inflationPct,
    targetValue: clean.targetValue && clean.targetValue > 0 ? clean.targetValue : null,
  }
  const spread = clean.spread ?? DEFAULTS.spread
  const wealthLab = wealthLabUrl({ ...inputs, spread })
  // Re-read the link so the numbers below are computed from exactly what the page will show.
  const used = { ...inputs, ...decodeWealthParams(encodeWealthParams({ ...inputs, spread })) }

  const set = scenarios(used, spread)
  const base = set.base.summary
  const target = used.targetValue ?? 0
  const out: Record<string, unknown> = {
    assumptions: {
      startingValue: used.startingValue,
      startingValueSource: importedStart ? "imported from the user's current investable assets" : "given by the user",
      monthlyContribution: used.monthlyContribution,
      annualContributionGrowthPct: used.annualContributionGrowthPct,
      years: used.years,
      expectedAnnualReturnPct: used.expectedAnnualReturnPct,
      inflationPct: used.inflationPct,
      targetValue: target > 0 ? target : null,
    },
    baseCase: {
      finalNominal: round(base.finalNominal),
      finalRealTodaysDollars: round(base.finalReal),
      totalContributions: round(base.totalContributions),
      totalGrowth: round(base.totalGrowth),
    },
    scenarios: {
      conservative: { returnPct: set.conservative.inputs.expectedAnnualReturnPct, finalNominal: round(set.conservative.summary.finalNominal) },
      optimistic: { returnPct: set.optimistic.inputs.expectedAnnualReturnPct, finalNominal: round(set.optimistic.summary.finalNominal) },
    },
    wealthLabUrl: wealthLab,
    note: "Hypothetical projection from the stated assumptions, not a prediction. The user can open it in Wealth Lab with the button shown.",
  }
  if (importedStart) out.importedNote = "Starting value was not given, so it was set to the user's real investable assets. Tell the user this."
  if (target > 0) {
    const months = monthsToReachTarget(used)
    out.target = {
      reachedWithinHorizon: base.monthsToTarget != null,
      yearsToTarget: years(months),
      requiredMonthlyContribution: (() => {
        const r = requiredMonthlyContribution(target, used.years, used)
        return r == null ? null : round(r)
      })(),
      requiredIsFirstYearAmount: "Required monthly amount is the first-year figure; it rises by the contribution growth each year.",
      progressPercent: base.progress == null ? null : round(base.progress * 100, 1),
      ifAdd250PerMonth: (() => {
        const s = yearsSaved(250, used)
        return { monthsSaved: s.monthsSaved, yearsToTargetWithExtra: years(s.withExtraMonths) }
      })(),
    }
  }
  ctx.emit({ type: "link", label: "Open in Wealth Lab", href: wealthLab })
  return out
}
