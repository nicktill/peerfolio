/**
 * Live stock prices behind a small interface, so the source can be swapped
 * (Finnhub today; Alpaca, Massive or Twelve Data later) by writing one adapter
 * and changing `QUOTE_PROVIDER`, with no change to anything that uses prices.
 *
 * Free of database and framework imports so the tests can run it directly.
 */

import { createFinnhubProvider } from "./finnhub.ts"

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
 * The provider named by `QUOTE_PROVIDER` (default `finnhub`), or null when live
 * prices are off or not configured. Null is a normal state: everything then
 * falls back to daily closes.
 */
export function createQuoteProvider(env: Record<string, string | undefined>, fetchImpl: typeof fetch = fetch): QuoteProvider | null {
  const name = (env.QUOTE_PROVIDER ?? "finnhub").trim().toLowerCase()
  switch (name) {
    case "finnhub":
      return env.FINNHUB_API_KEY ? createFinnhubProvider({ apiKey: env.FINNHUB_API_KEY, fetchImpl }) : null
    case "off":
    case "none":
      return null
    default:
      // A typo shouldn't silently disable live prices with no trace.
      console.error(`[quotes] unknown QUOTE_PROVIDER "${name}"; live prices are off`)
      return null
  }
}

const OPEN_MINUTE = 9 * 60 + 30
/** A few minutes past 4pm ET so the closing print is caught. */
const CLOSE_MINUTE = 16 * 60 + 5

/**
 * Whether the US stock market's regular session is (about) open, in New York
 * time so daylight saving takes care of itself. Holidays are not listed here;
 * `acceptQuote` rejects the stale prices a holiday produces.
 */
export function isUsMarketOpen(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ""
  if (get("weekday") === "Sat" || get("weekday") === "Sun") return false
  const minutes = Number(get("hour")) * 60 + Number(get("minute"))
  return minutes >= OPEN_MINUTE && minutes < CLOSE_MINUTE
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
