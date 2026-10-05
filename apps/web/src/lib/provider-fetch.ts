/**
 * Every request to a price provider goes through `providerFetch`, so one budget per
 * provider covers all of its callers: live prices, the close catch-up, trades and
 * queued fills, imports, search, metadata, logos and the probe.
 *
 * The budget is a token bucket shared by every server through the database (see
 * provider-budget.ts). A request takes a token before it is sent, so failures count
 * too. Within any 60 seconds a provider gets at most `burst + perMinute` requests,
 * set below its allowance for headroom. Without a token the caller gets a 429 made
 * here, which every provider adapter already treats as "stop and leave the rest for
 * the next run". A real 429 sets a cooldown that every server honors.
 *
 * Free of database imports (the budget is loaded on first use) so the adapters that
 * default to this stay importable by the unit tests, which pass their own fetch.
 */

import { AsyncLocalStorage } from "node:async_hooks"

export type ProviderName = "finnhub" | "alpaca" | "massive" | "tiingo"

export type Budget = { perMinute: number; burst: number }

/**
 * Free-plan allowances and what we let ourselves use of them: at most `burst +
 * perMinute` in any minute, below each allowance. Massive allows only 5 a minute, so
 * at most 4: two at once, then one every 30 seconds. Tiingo allows 50 an hour and
 * 1,000 a day; 40 an hour plus a burst of 5 stays under both.
 */
const DEFAULTS: Record<ProviderName, Budget> = {
  finnhub: { perMinute: 40, burst: 5 }, // allows 60 a minute
  alpaca: { perMinute: 150, burst: 10 }, // allows 200 a minute
  massive: { perMinute: 2, burst: 2 }, // allows 5 a minute
  tiingo: { perMinute: 40 / 60, burst: 5 }, // allows 50 an hour, 1,000 a day
}

/** The budget for `provider`, overridable with e.g. FINNHUB_PER_MINUTE and FINNHUB_BURST. */
export function budgetFor(provider: ProviderName, env: Record<string, string | undefined> = process.env): Budget {
  const name = provider.toUpperCase()
  const read = (key: string, fallback: number) => {
    const value = Number(env[`${name}_${key}`])
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  return { perMinute: read("PER_MINUTE", DEFAULTS[provider].perMinute), burst: Math.max(1, read("BURST", DEFAULTS[provider].burst)) }
}

/** Seconds to wait from a Retry-After header (seconds or an HTTP date); a minute when absent or unreadable. */
export function retryAfterSeconds(header: string | null, now = Date.now()): number {
  const DEFAULT = 60
  if (!header) return DEFAULT
  const seconds = /^\s*\d+\s*$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000
  if (!Number.isFinite(seconds)) return DEFAULT
  return Math.min(3600, Math.max(1, Math.ceil(seconds)))
}

export type Take = { granted: boolean; waitSeconds: number }

type Gate = {
  take(provider: ProviderName, budget: Budget): Promise<Take>
  cooldown(provider: ProviderName, seconds: number): Promise<void>
}

let gate: Promise<Gate | null> | undefined
const loadGate = () =>
  (gate ??= import("./provider-budget.ts").then(
    (module) => module.gate,
    (error: unknown) => {
      console.error("[budget] unavailable, requests go out unbudgeted:", error instanceof Error ? error.message : error)
      return null
    },
  ))

/** Marks a 429 as ours rather than the provider's, for logs and tests. */
export const BUDGET_HEADER = "x-peerfolio-budget"

const patience = new AsyncLocalStorage<number>()

/**
 * Runs `fn` with leave to wait up to `ms` in total for provider tokens, for scheduled
 * jobs that would rather finish a little later than leave work undone. Page loads
 * don't wait: they get an answer now and the work goes to a later run.
 */
export function withProviderPatience<T>(ms: number, fn: () => Promise<T>): Promise<T> {
  return patience.run(Date.now() + ms, fn)
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/** A fetch for `provider` that spends from its shared budget and honors its cooldowns. */
export function providerFetch(provider: ProviderName): typeof fetch {
  return async (input, init) => {
    const budgeted = await loadGate()
    if (budgeted) {
      const budget = budgetFor(provider)
      for (;;) {
        const take = await budgeted.take(provider, budget)
        if (take.granted) break
        const deadline = patience.getStore() ?? 0
        const wait = take.waitSeconds * 1000 + 50
        if (Date.now() + wait > deadline) {
          return new Response(JSON.stringify({ error: `${provider} request budget spent; retry in ${Math.ceil(take.waitSeconds)}s` }), {
            status: 429,
            headers: { "content-type": "application/json", "retry-after": String(Math.ceil(take.waitSeconds)), [BUDGET_HEADER]: "spent" },
          })
        }
        await sleep(wait)
      }
    }

    // Looked up at call time, so a stub installed after this module loaded is used.
    const response = await globalThis.fetch(input, init)
    if (response.status === 429 && budgeted) {
      const seconds = retryAfterSeconds(response.headers.get("retry-after"))
      console.warn(`[budget] ${provider} rate limited us; every server waits ${seconds}s`)
      await budgeted.cooldown(provider, seconds)
    }
    return response
  }
}
