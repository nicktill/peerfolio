/**
 * Finnhub adapter for {@link QuoteProvider}.
 *
 * Finnhub's free plan allows 60 calls a minute and answers extra calls with
 * HTTP 429. Developers who retry on 429 burn the next minute's budget too, so
 * the first 429 here stops the run: what was gathered is returned and the rest
 * waits for the next refresh. The free plan is for personal, non-commercial use;
 * moving to a paid plan (or another provider) is a config change, not a rewrite.
 *
 * Free of database and framework imports so the tests can stub `fetch`.
 */

import type { Quote, QuoteProvider, QuoteResult } from "./quote-provider.ts"
import { providerFetch, type ProviderFetch } from "./provider-fetch.ts"

const BASE_URL = "https://finnhub.io/api/v1"

/** US-listed symbols only; crypto (`X:BTCUSD`) and anything malformed is skipped. */
const SYMBOL = /^[A-Z][A-Z0-9]{0,5}(\.[A-Z0-9]{1,2})?$/

export function createFinnhubProvider({
  apiKey,
  fetchImpl = providerFetch("finnhub"),
  concurrency = 4,
  timeoutMs = 5_000,
  baseUrl = BASE_URL,
}: {
  apiKey: string
  fetchImpl?: ProviderFetch
  concurrency?: number
  timeoutMs?: number
  baseUrl?: string
}): QuoteProvider {
  async function quoteOne(symbol: string): Promise<{ quote?: Quote; rateLimited?: boolean; failed?: boolean }> {
    try {
      const response = await fetchImpl(`${baseUrl}/quote?symbol=${encodeURIComponent(symbol)}`, {
        // In a header, not the URL, so the key doesn't end up in request logs.
        headers: { "X-Finnhub-Token": apiKey },
        cache: "no-store",
        // Starts when the request is sent, after any wait for budget.
        timeoutMs,
      })
      if (response.status === 429) return { rateLimited: true }
      if (!response.ok) return { failed: true }

      const body = (await response.json()) as { c?: unknown; t?: unknown }
      // Finnhub answers an unknown symbol with all zeros rather than an error.
      if (typeof body.c !== "number" || !Number.isFinite(body.c) || !(body.c > 0)) return {}
      if (typeof body.t !== "number" || !Number.isFinite(body.t) || !(body.t > 0)) return {}
      return { quote: { price: body.c, asOf: new Date(body.t * 1000).toISOString() } }
    } catch {
      return { failed: true }
    }
  }

  return {
    name: "finnhub",

    async getQuotes(marketTickers: string[]): Promise<QuoteResult> {
      const result: QuoteResult = { quotes: new Map(), rateLimited: false, failed: 0 }
      const queue = [...new Set(marketTickers)].filter((t) => SYMBOL.test(t))

      const worker = async () => {
        while (!result.rateLimited) {
          const symbol = queue.shift()
          if (!symbol) return
          const outcome = await quoteOne(symbol)
          if (outcome.rateLimited) result.rateLimited = true
          else if (outcome.failed) result.failed++
          else if (outcome.quote) result.quotes.set(symbol, outcome.quote)
        }
      }

      await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker))
      return result
    },
  }
}
