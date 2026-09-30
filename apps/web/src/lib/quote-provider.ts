/**
 * Live stock prices behind a small interface, so the source can be swapped
 * (Finnhub today; Alpaca, Massive or Twelve Data later) by writing one adapter
 * and changing `QUOTE_PROVIDER`, with no change to anything that uses prices.
 *
 * Free of database and framework imports so the tests can run it directly.
 */

import { createAlpacaProvider } from "./alpaca.ts"
import { createCompositeProvider } from "./composite-provider.ts"
import { createFinnhubProvider } from "./finnhub.ts"
import { isUsMarketOpen } from "./market-hours.ts"

export { isUsMarketOpen }

/** The price of one ticker at the time of its last trade. */
export type Quote = {
  price: number
  /** ISO time of the last trade, as reported by the provider. */
  asOf: string
}

export type QuoteResult = {
  /** Keyed by the ticker that was asked for. Tickers the provider had nothing for are left out. */
  quotes: Map<string, Quote>
  /** The provider told us to slow down. Whatever was gathered before that is still returned. */
  rateLimited: boolean
  /** Requests that failed for any other reason. */
  failed: number
  /** How many quotes each source supplied, when several were combined. */
  sources?: Record<string, number>
}

/**
 * What every provider implements. A provider that can fetch many tickers in
 * one call (Alpaca, Massive snapshots) does exactly that inside `getQuotes`; one
 * that needs a call per ticker (Finnhub) spaces them out itself. Callers never
 * need to know which.
 */
export interface QuoteProvider {
  readonly name: string
  getQuotes(marketTickers: string[]): Promise<QuoteResult>
}

/**
 * The provider named by `QUOTE_PROVIDER`, or null when live prices are off or
 * nothing is configured. Null is a normal state: everything then falls back to
 * daily closes.
 *
 * The default (`auto`) uses every source that has keys, in order: Alpaca (one
 * call for many tickers), then Finnhub for whatever it couldn't price.
 */
export function createQuoteProvider(
  env: Record<string, string | undefined>,
  fetchImpl: typeof fetch = fetch,
  now: () => Date = () => new Date(),
  // `anyAge` keeps the last trade however old it is. Live refreshes want only recent
  // trades; pricing a ticker for the first time (an import) wants the best price there is.
  { anyAge = false }: { anyAge?: boolean } = {},
): QuoteProvider | null {
  const name = (env.QUOTE_PROVIDER ?? "auto").trim().toLowerCase()

  const alpaca = () => (env.ALPACA_API_KEY && env.ALPACA_API_SECRET ? createAlpacaProvider({ keyId: env.ALPACA_API_KEY, secret: env.ALPACA_API_SECRET, fetchImpl }) : null)
  const finnhub = () => (env.FINNHUB_API_KEY ? createFinnhubProvider({ apiKey: env.FINNHUB_API_KEY, fetchImpl }) : null)

  switch (name) {
    case "auto": {
      const list = [alpaca(), finnhub()].filter((p): p is QuoteProvider => p !== null)
      if (list.length === 0) return null
      return list.length === 1 ? list[0]! : createCompositeProvider(list, (quote) => anyAge || acceptQuote(quote, now()))
    }
    case "alpaca":
      return alpaca()
    case "finnhub":
      return finnhub()
    case "off":
    case "none":
      return null
    default:
      // A typo shouldn't silently disable live prices with no trace.
      console.error(`[quotes] unknown QUOTE_PROVIDER "${name}"; live prices are off`)
      return null
  }
}

/** A last trade older than this isn't "live": the market is shut, halted, or it's a holiday. */
export const MAX_QUOTE_AGE_MS = 30 * 60_000

/**
 * Whether a quote is fit to store as the current price: a real positive number
 * from a recent trade. This is what stops a holiday's or halt's stale print
 * from overwriting a good price.
 */
export function acceptQuote(quote: Quote | undefined, now: Date): quote is Quote {
  if (!quote || !Number.isFinite(quote.price) || !(quote.price > 0)) return false
  const at = Date.parse(quote.asOf)
  if (!Number.isFinite(at)) return false
  const age = now.getTime() - at
  // A little clock skew into the future is fine; far more is a bad timestamp.
  return age <= MAX_QUOTE_AGE_MS && age >= -5 * 60_000
}

/** The trading date a quote belongs to. The regular session never crosses a UTC midnight. */
export function quoteDate(quote: Quote): string {
  return quote.asOf.slice(0, 10)
}

/** "live" while the market is open and the price is from today, otherwise "close". */
export function priceLabel(priceAsOf: string | null | undefined, now: Date): "live" | "close" {
  if (!priceAsOf) return "close"
  return priceAsOf.slice(0, 10) === now.toISOString().slice(0, 10) && isUsMarketOpen(now) ? "live" : "close"
}
