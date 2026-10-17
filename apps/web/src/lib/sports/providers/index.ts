import { DEFAULT_PLAN, estimateCredits, type UsageStore } from "../credit-budget.ts"
import { PROP_MARKETS, TheOddsApiProvider } from "./the-odds-api.ts"
import { createCompositeOdds, withSnapshotCache, type Source } from "./composite.ts"
import { MockProvider } from "./mock.ts"
import { EspnResultsProvider } from "./espn.ts"
import { NhlResultsProvider } from "./nhl-api.ts"
import { MlbResultsProvider } from "./mlb-statsapi.ts"
import { ExchangeOddsProvider, type CallCap } from "./polymarket-odds.ts"
import type { OddsProvider, ResultsProvider, Sport } from "../types.ts"
import { DEFAULT_RESOLVE, resolveConfigForSport, type ResolveConfig, type ResolveConfigFor } from "../settlement.ts"

/**
 * Wires providers from environment variables.
 *
 * SPORTS_MOCK=1 uses the offline mock (local dev, demos, tests) and wins over everything.
 * SPORTS_ODDS_SOURCE picks the line source, default "exchange":
 *   exchange   free: Polymarket prices (Kalshi cross-check) on ESPN's schedule. Needs no key and never touches any Odds API credits,
 *              even when THE_ODDS_API_KEY happens to be set.
 *   odds-api   opt-in, metered: the sportsbook consensus from the vendors below. Order is priority:
 *                1. THE_ODDS_API_KEY            (the-odds-api.com, free 500 credits/mo, unverified)
 *                2. PROPLINE_API_KEY + PROPLINE_BASE_URL  (Odds-API-compatible, unverified)
 * Keys live only in env vars.
 */

export const isMockMode = () => process.env.SPORTS_MOCK === "1"

export type OddsSource = "exchange" | "odds-api"
/** "odds-api" only when asked for explicitly; anything else (including unset) is the free exchange source. */
export const oddsSource = (): OddsSource => (process.env.SPORTS_ODDS_SOURCE?.trim().toLowerCase() === "odds-api" ? "odds-api" : "exchange")
export type PublishMode = "mock" | "exchange" | "odds-api"
export const publishMode = (): PublishMode => (isMockMode() ? "mock" : oddsSource())

/** Sports the publish cron may look at: SPORTS_ENABLED_SPORTS (comma list) or all of them. */
export function enabledSports(all: readonly Sport[]): Sport[] {
  const raw = process.env.SPORTS_ENABLED_SPORTS?.trim()
  if (!raw) return [...all]
  const wanted = new Set(raw.toLowerCase().split(/[\s,]+/).filter(Boolean))
  return all.filter((s) => wanted.has(s))
}

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

/** The exchange provider (for its free schedule check) and the cached provider the publisher fetches through. */
export function buildExchangeOdds(cap?: CallCap): { exchange: ExchangeOddsProvider; provider: OddsProvider } {
  const exchange = new ExchangeOddsProvider({ cap })
  return { exchange, provider: withSnapshotCache(exchange, 5 * 60_000) }
}

export function buildOddsProvider(usage: UsageStore, cap?: CallCap): OddsProvider {
  if (isMockMode()) return withSnapshotCache(new MockProvider(), 60_000)
  // Free path: no usage store is consulted, so no credit can be spent or blocked on.
  if (oddsSource() === "exchange") return buildExchangeOdds(cap).provider
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

/**
 * Settlement sources. Exchange mode (default): free sources only, ESPN on (unless ESPN_RESULTS_ENABLED=0), no metered vendor even if
 * a key is set. Odds-API mode: the vendors' score endpoints, plus ESPN when ESPN_RESULTS_ENABLED=1 (a separate family).
 */
export function buildResultsProviders(): ResultsProvider[] {
  if (isMockMode()) return [new MockProvider()]
  const out: ResultsProvider[] = []
  if (oddsSource() === "exchange") {
    if (process.env.ESPN_RESULTS_ENABLED !== "0") out.push(new EspnResultsProvider())
    // The leagues' own keyless APIs: an independent second family for NHL and MLB. NHL_API_RESULTS_ENABLED=0 / MLB_API_RESULTS_ENABLED=0 turn them off.
    if (process.env.NHL_API_RESULTS_ENABLED !== "0") out.push(new NhlResultsProvider())
    if (process.env.MLB_API_RESULTS_ENABLED !== "0") out.push(new MlbResultsProvider())
    return out
  }
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

/** How many distinct families in `providers` can answer for a sport. */
export function familiesFor(providers: ResultsProvider[], sport: Sport): number {
  return new Set(providers.filter((p) => !p.sports || p.sports.includes(sport)).map((p) => p.family ?? p.name)).size
}

/**
 * Per-sport settlement policy (see FREE_RESULT_FAMILIES): sports with two free families keep requiring both, the rest settle
 * on ESPN alone behind the stricter single-source safety net. SPORTS_MIN_RESULT_SOURCES, when set, overrides the quorum for
 * every sport (and the route then insists that many families exist). Mock mode settles instantly.
 */
export function resolveConfigFor(providers: ResultsProvider[]): ResolveConfigFor {
  const override = Number(process.env.SPORTS_MIN_RESULT_SOURCES)
  return (sport) => {
    if (isMockMode()) return { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 }
    if (override >= 1) return { ...DEFAULT_RESOLVE, minSources: override }
    return resolveConfigForSport(DEFAULT_RESOLVE, sport, familiesFor(providers, sport))
  }
}

/** Global config (the override or the two-family default), kept for callers that do not know the sport. */
export function resolveConfig(): ResolveConfig {
  if (isMockMode()) return { ...DEFAULT_RESOLVE, minSources: 1, settleDelayMs: 0 }
  const min = Number(process.env.SPORTS_MIN_RESULT_SOURCES)
  return min >= 1 ? { ...DEFAULT_RESOLVE, minSources: min } : DEFAULT_RESOLVE
}

/** Sports that cannot settle because too few families cover them (zero providers, or fewer than an explicit override asks for). */
export function sportsWithoutQuorum(providers: ResultsProvider[], sports: readonly Sport[]): Sport[] {
  const cfgFor = resolveConfigFor(providers)
  return sports.filter((s) => familiesFor(providers, s) < cfgFor(s).minSources || familiesFor(providers, s) < 1)
}
