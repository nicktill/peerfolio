/**
 * Credit budgeting for metered odds providers (The Odds API bills "credits",
 * SportsGameOdds "objects"). Sibling of lib/provider-budget.ts, which meters
 * rate-limited stock-quote providers with a token bucket; sports providers are
 * limited by a monthly quota instead, so the budget is a monthly cap paced
 * across the days left.
 *
 * Pure policy here; the store (memory for tests, database in production)
 * only records usage. Free of imports so tests run it directly.
 */

export type CreditPlan = {
  /** Credits the plan includes per month. */
  monthly: number
  /** Fraction of the monthly cap we allow ourselves to spend. Keeps headroom for retries and clock skew. */
  safety: number
  /** One day may spend up to this multiple of an even daily share, so a heavy NFL Sunday still fits. */
  dayBurst: number
}

export const DEFAULT_PLAN: CreditPlan = { monthly: 500, safety: 0.9, dayBurst: 2 }

export interface UsageStore {
  /** Credits used by `provider` in the UTC month and day of `now`. */
  usage(provider: string, now: Date): Promise<{ month: number; day: number }>
  record(provider: string, credits: number, now: Date): Promise<void>
}

const daysInMonth = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate()

/** Whether spending `cost` more credits today stays inside both the month's cap and the day's paced share. */
export function canSpend(plan: CreditPlan, used: { month: number; day: number }, cost: number, now: Date): boolean {
  if (cost <= 0) return true
  const monthCap = Math.floor(plan.monthly * plan.safety)
  if (used.month + cost > monthCap) return false
  const dayCap = Math.ceil((monthCap / daysInMonth(now)) * plan.dayBurst)
  return used.day + cost <= dayCap
}

export class MemoryUsageStore implements UsageStore {
  private readonly rows = new Map<string, number>()
  private static keys(provider: string, now: Date) {
    const day = now.toISOString().slice(0, 10)
    return { day: `${provider}|${day}`, month: `${provider}|${day.slice(0, 7)}` }
  }
  async usage(provider: string, now: Date) {
    const k = MemoryUsageStore.keys(provider, now)
    return { month: this.rows.get(k.month) ?? 0, day: this.rows.get(k.day) ?? 0 }
  }
  async record(provider: string, credits: number, now: Date) {
    const k = MemoryUsageStore.keys(provider, now)
    for (const key of [k.month, k.day]) this.rows.set(key, (this.rows.get(key) ?? 0) + credits)
  }
}

/** Credits one Odds-API-style fetch costs: one per market per region, props one event at a time. */
export function estimateCredits(opts: { gameMarkets: number; regions: number; sportKeys: number; propMarkets: number; propEvents: number }): number {
  const games = opts.gameMarkets * opts.regions * opts.sportKeys
  const props = opts.propMarkets * opts.regions * opts.propEvents
  return games + props
}
