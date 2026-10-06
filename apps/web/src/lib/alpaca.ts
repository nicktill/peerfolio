/**
 * Alpaca market-data adapter for {@link QuoteProvider}.
 *
 * One request prices many tickers (the multi-symbol snapshots endpoint), so a
 * full refresh of every held ticker is a call or two rather than one per
 * ticker. The free plan serves the IEX feed: real-time, but only trades that
 * happened on IEX, so a thinly traded fund can go quiet for a while. Quotes
 * that come back stale are left for the next provider to fill.
 *
 * Free of database and framework imports so the tests can stub `fetch`.
 */

import type { Quote, QuoteProvider, QuoteResult } from "./quote-provider.ts"
import { providerFetch, type ProviderFetch } from "./provider-fetch.ts"

const BASE_URL = process.env.ALPACA_DATA_URL ?? "https://data.alpaca.markets"

/** US-listed symbols only; crypto (`X:BTCUSD`) and anything malformed is skipped. */
const SYMBOL = /^[A-Z][A-Z0-9]{0,5}(\.[A-Z0-9]{1,2})?$/

/** Symbols per request: comfortably inside URL length limits. */
const CHUNK = 100

type Snapshot = { latestTrade?: { p?: unknown; t?: unknown } }

/** Alpaca timestamps carry nanoseconds; JavaScript dates stop at milliseconds. */
const toIso = (t: string) => {
  const ms = Date.parse(t.replace(/(\.\d{3})\d+/, "$1"))
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

export function createAlpacaProvider({
  keyId,
  secret,
  feed = "iex",
  fetchImpl = providerFetch("alpaca"),
  timeoutMs = 8_000,
  baseUrl = BASE_URL,
}: {
  keyId: string
  secret: string
  feed?: "iex" | "sip"
  fetchImpl?: ProviderFetch
  timeoutMs?: number
  baseUrl?: string
}): QuoteProvider {
  return {
    name: "alpaca",

    async getQuotes(marketTickers: string[]): Promise<QuoteResult> {
      const result: QuoteResult = { quotes: new Map(), rateLimited: false, failed: 0 }
      const symbols = [...new Set(marketTickers)].filter((t) => SYMBOL.test(t))

      for (let i = 0; i < symbols.length && !result.rateLimited; i += CHUNK) {
        const chunk = symbols.slice(i, i + CHUNK)
        try {
          const response = await fetchImpl(`${baseUrl}/v2/stocks/snapshots?symbols=${encodeURIComponent(chunk.join(","))}&feed=${feed}`, {
            // Headers, not the URL, so the keys don't end up in request logs.
            headers: { "APCA-API-KEY-ID": keyId, "APCA-API-SECRET-KEY": secret },
            cache: "no-store",
            // Starts when the request is sent, after any wait for budget.
            timeoutMs,
          })
          if (response.status === 429) {
            result.rateLimited = true
            break
          }
          if (!response.ok) {
            result.failed++
            continue
          }

          const body = (await response.json()) as Record<string, unknown>
          // The answer is keyed by symbol; older versions wrapped it in `snapshots`.
          const bySymbol = (body.snapshots && typeof body.snapshots === "object" ? body.snapshots : body) as Record<string, Snapshot | undefined>

          for (const symbol of chunk) {
            const trade = bySymbol[symbol]?.latestTrade
            if (typeof trade?.p !== "number" || !Number.isFinite(trade.p) || !(trade.p > 0) || typeof trade.t !== "string") continue
            const asOf = toIso(trade.t)
            if (asOf) result.quotes.set(symbol, { price: trade.p, asOf } satisfies Quote)
          }
        } catch {
          result.failed++
        }
      }

      return result
    },
  }
}
