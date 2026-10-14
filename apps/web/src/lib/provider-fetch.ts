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
 * When the budget can't be checked (the database is unreachable, or its table
 * missing), requests are refused like an empty budget: stored prices stay as they
 * are rather than requests going out unmetered.
 *
 * Free of database imports (the budget is loaded on first use) so the adapters that
 * default to this stay importable by the unit tests, which pass their own fetch.
 */

import { AsyncLocalStorage } from "node:async_hooks"
import { BUDGET_DEFAULTS, buildEvent, classifyError, createEventLimiter, symbolCount, type EventKind, type NewProviderEvent } from "./provider-stats-core.ts"

export type ProviderName = "finnhub" | "alpaca" | "massive" | "tiingo"

export type Budget = { perMinute: number; burst: number }

/** The budget for `provider`, overridable with e.g. FINNHUB_PER_MINUTE and FINNHUB_BURST. */
export function budgetFor(provider: ProviderName, env: Record<string, string | undefined> = process.env): Budget {
  const name = provider.toUpperCase()
  const read = (key: string, fallback: number) => {
    const value = Number(env[`${name}_${key}`])
    return Number.isFinite(value) && value > 0 ? value : fallback
  }
  return { perMinute: read("PER_MINUTE", BUDGET_DEFAULTS[provider].perMinute), burst: Math.max(1, read("BURST", BUDGET_DEFAULTS[provider].burst)) }
}

/**
 * Seconds to wait from a Retry-After header (seconds or an HTTP date), as long as the
 * provider asks; a minute when it is absent or unreadable, and never under a second.
 */
export function retryAfterSeconds(header: string | null, now = Date.now()): number {
  const DEFAULT = 60
  if (!header) return DEFAULT
  const seconds = /^\s*\d+\s*$/.test(header) ? Number(header) : (Date.parse(header) - now) / 1000
  if (!Number.isFinite(seconds)) return DEFAULT
  return Math.max(1, Math.ceil(seconds))
}

export type Take = { granted: boolean; waitSeconds: number; unavailable?: boolean; cooldown?: boolean }

type Gate = {
  take(provider: ProviderName, budget: Budget): Promise<Take>
  cooldown(provider: ProviderName, seconds: number): Promise<void>
}

let gate: Promise<Gate | null> | undefined
const loadGate = () =>
  (gate ??= import("./provider-budget.ts").then(
    (module) => module.gate,
    (error: unknown) => {
      console.error("[budget] unavailable, so no provider requests go out:", error instanceof Error ? error.message : error)
      gate = undefined // try loading again next time
      return null
    },
  ))

/**
 * Counts a request in the per-minute usage stats. Loaded on first use, fire and
 * forget, and silent on any failure: metrics never hold up or break a fetch.
 */
type Outcome = { requests?: number; symbols?: number; denied?: number; rateLimited?: number; failed?: number }
function record(provider: ProviderName, outcome: Outcome) {
  import("./provider-stats.ts").then((m) => m.recordProviderRequest(provider, outcome)).catch(() => {})
}

const callers = new AsyncLocalStorage<string>()

/**
 * Labels the provider requests made inside `fn` (e.g. "live-quotes", "closes") so the
 * event log can say what asked. Nested labels read outer>inner.
 */
export function withProviderCaller<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const outer = callers.getStore()
  return callers.run(outer && outer !== label ? `${outer}>${label}` : label, fn)
}

const eventLimiter = createEventLimiter()

/** Reads at most the start of an error body, giving up after two seconds. */
async function readBody(response: Response): Promise<string | undefined> {
  const timeout = new Promise<undefined>((resolve) => setTimeout(resolve, 2_000))
  const text = response.text().then((t) => t.slice(0, 2_000))
  return Promise.race([text, timeout]).catch(() => undefined)
}

/**
 * Logs a request that didn't succeed. Fire and forget, capped per provider per minute,
 * and silent on any failure: the log never holds up or breaks a fetch. The body of an
 * error response is read from a clone, and only for the events that will be stored.
 */
function logEvent(
  provider: ProviderName,
  input: RequestInfo | URL,
  event: { kind: EventKind; status?: number; reason?: string; waitSeconds?: number; response?: Response },
) {
  try {
    const admit = eventLimiter.admit(provider)
    if (!admit.write) return
    const caller = callers.getStore()
    const store = (body?: string) => {
      const row: NewProviderEvent = buildEvent({ provider, input, ...event, body, caller, suppressed: admit.suppressed })
      import("./provider-stats.ts").then((m) => m.recordProviderEvent(row)).catch(() => {})
    }
    if (event.response && event.reason === undefined) readBody(event.response.clone()).then(store, () => store())
    else store()
  } catch {
    // never throw from logging
  }
}

/**
 * A request's options, plus `timeoutMs`: a timeout that starts when the request is
 * sent, not when it was queued, so time spent waiting for budget doesn't use it up.
 */
export type ProviderInit = RequestInit & { timeoutMs?: number }
export type ProviderFetch = (input: RequestInfo | URL, init?: ProviderInit) => Promise<Response>

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
export function providerFetch(provider: ProviderName): ProviderFetch {
  const refuse = (waitSeconds: number, why: string) =>
    new Response(JSON.stringify({ error: `${provider} ${why}; retry in ${Math.ceil(waitSeconds)}s` }), {
      status: 429,
      headers: { "content-type": "application/json", "retry-after": String(Math.ceil(waitSeconds)), [BUDGET_HEADER]: why },
    })

  return async (input, init) => {
    const budgeted = await loadGate()
    if (!budgeted) return refuse(60, "request budget unavailable")
    const budget = budgetFor(provider)
    for (;;) {
      const take = await budgeted.take(provider, budget)
      if (take.granted) break
      const deadline = patience.getStore() ?? 0
      const wait = take.waitSeconds * 1000 + 50
      if (Date.now() + wait > deadline) {
        record(provider, { denied: 1 })
        logEvent(provider, input, {
          kind: "denied",
          reason: take.unavailable ? "budget unavailable" : take.cooldown ? "cooldown" : "budget spent",
          waitSeconds: take.waitSeconds,
        })
        return refuse(take.waitSeconds, take.unavailable ? "request budget unavailable" : "request budget spent")
      }
      await sleep(wait)
    }

    // The timeout starts now that the request is admitted.
    const { timeoutMs, ...options } = init ?? {}
    const signal = timeoutMs ? AbortSignal.timeout(timeoutMs) : options.signal
    // Looked up at call time, so a stub installed after this module loaded is used.
    const symbols = symbolCount(input)
    let response: Response
    try {
      response = await globalThis.fetch(input, { ...options, signal })
    } catch (error) {
      record(provider, { requests: 1, symbols, failed: 1 })
      logEvent(provider, input, classifyError(error))
      throw error
    }
    record(provider, {
      requests: 1,
      symbols,
      rateLimited: response.status === 429 ? 1 : 0,
      failed: response.status >= 400 && response.status !== 429 ? 1 : 0,
    })
    if (response.status >= 400 && response.status !== 429) logEvent(provider, input, { kind: "failed", status: response.status, response })
    if (response.status === 429) {
      const seconds = retryAfterSeconds(response.headers.get("retry-after"))
      logEvent(provider, input, { kind: "rate_limited", status: 429, waitSeconds: seconds, response })
      console.warn(`[budget] ${provider} rate limited us; every server waits ${seconds}s`)
      await budgeted.cooldown(provider, seconds)
    }
    return response
  }
}
