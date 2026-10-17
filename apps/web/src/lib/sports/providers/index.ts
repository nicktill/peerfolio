import { DEFAULT_PLAN, estimateCredits, type UsageStore } from "../credit-budget.ts"
import { PROP_MARKETS, TheOddsApiProvider } from "./the-odds-api.ts"
import { createCompositeOdds, withSnapshotCache, type Source } from "./composite.ts"
import { MockProvider } from "./mock.ts"
import { EspnResultsProvider } from "./espn.ts"
import type { OddsProvider, ResultsProvider, Sport } from "../types.ts"
import { DEFAULT_RESOLVE, type ResolveConfig } from "../settlement.ts"

/**
 * Wires providers from environment variables. Order is priority:
 *   1. THE_ODDS_API_KEY            (the-odds-api.com, free 500 credits/mo, unverified)
 *   2. PROPLINE_API_KEY + PROPLINE_BASE_URL  (Odds-API-compatible, unverified)
 * SPORTS_MOCK=1 uses the offline mock instead (local dev, demos, tests).
 * Keys live only in env vars.
 */

export const isMockMode = () => process.env.SPORTS_MOCK === "1"

const monthlyOf = (monthlyVar: string, fallback: number) => (Number(process.env[monthlyVar]) > 0 ? Number(process.env[monthlyVar]) : fallback)

/** Share of a key's monthly credits that settlement (`/scores`) may use. The odds fetches get the rest, so neither can starve the other. */
export const RESULTS_SHARE = 0.25

const plan = (monthlyVar: string, fallback: number) => ({
  ...DEFAULT_PLAN,
  monthly: Math.floor(monthlyOf(monthlyVar, fallback) * (1 - RESULTS_SHARE)),
})

const oddsApiCost = (props: boolean) => (sport: Sport) =>
  estimateCredits({
    gameMarkets: 3,
    regions: 1,
    // Tennis has one sport key per tournament; assume up to 3 in play.
    sportKeys: sport === "tennis" ? 3 : 1,
    propMarkets: props ? PROP_MARKETS[sport].length : 0,
    propEvents: props ? 8 : 0,
  })

export function buildOddsProvider(usage: UsageStore): OddsProvider {
  if (isMockMode()) return withSnapshotCache(new MockProvider(), 60_000)
  const props = process.env.SPORTS_PROPS_ENABLED === "1"
  const sources: Source[] = []
  if (process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY) {
    sources.push({ provider: TheOddsApiProvider.fromEnv(), plan: plan("THE_ODDS_API_MONTHLY_CREDITS", 500), cost: oddsApiCost(props) })
  }
  // A second key from a separate account: asked only when the first is thin, failed or out of pace, with its own budget.
  const second = TheOddsApiProvider.secondFromEnv()
  if (second) sources.push({ provider: second, plan: plan("THE_ODDS_API_2_MONTHLY_CREDITS", 500), cost: oddsApiCost(props) })
  const compat = TheOddsApiProvider.compatibleFromEnv("propline", "PROPLINE_API_KEY", "PROPLINE_BASE_URL")
  if (compat) sources.push({ provider: compat, plan: plan("PROPLINE_MONTHLY_CREDITS", 500), cost: oddsApiCost(props) })
  if (!sources.length) throw new Error("No sports odds provider configured. Set THE_ODDS_API_KEY or SPORTS_MOCK=1")
  return withSnapshotCache(createCompositeOdds(sources, usage), 5 * 60_000)
}

/** Settlement sources: the odds vendors' score endpoints, plus ESPN when ESPN_RESULTS_ENABLED=1 (a separate family). */
export function buildResultsProviders(): ResultsProvider[] {
  if (isMockMode()) return [new MockProvider()]
  const out: ResultsProvider[] = []
  // Metered: settlement asks these only after a free source (ESPN) shows a final, inside their own share of the plan.
  if (process.env.THE_ODDS_API_KEY ?? process.env.ODDS_API_KEY) {
    out.push(TheOddsApiProvider.fromEnv().meterResults("the-odds-api:scores", Math.floor(monthlyOf("THE_ODDS_API_MONTHLY_CREDITS", 500) * RESULTS_SHARE)))
  }
  const compat = TheOddsApiProvider.compatibleFromEnv("propline", "PROPLINE_API_KEY", "PROPLINE_BASE_URL")
  if (compat) out.push(compat.meterResults("propline:scores", Math.floor(monthlyOf("PROPLINE_MONTHLY_CREDITS", 500) * RESULTS_SHARE)))
  // Independent of the odds vendors (its own family), so it can be the second source settlement needs.
  // Opt-in until ESPN's terms for this use are confirmed.
  if (process.env.ESPN_RESULTS_ENABLED === "1") out.push(new EspnResultsProvider())
  return out
}

/** Mock mode has one source and no waiting, so local settlement is instant. */
export function resolveConfig(): ResolveConfig {
  if (isMockMode()) return { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 }
  // Until a second independent results source exists, the owner can knowingly lower this (see STATUS.md).
  const min = Number(process.env.SPORTS_MIN_RESULT_SOURCES)
  return min >= 1 ? { ...DEFAULT_RESOLVE, minSources: min } : DEFAULT_RESOLVE
}
