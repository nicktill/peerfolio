/**
 * Several live-price sources behind one {@link QuoteProvider}: ask the first
 * for everything, then ask each next one only for what is still missing or too
 * old to count as live. A ticker one source doesn't know, or hasn't traded
 * lately, is filled by the next, and a source that is down costs nothing but
 * its share of the tickers.
 *
 * Free of database and framework imports so the tests can run it directly.
 */

import type { Quote, QuoteProvider, QuoteResult } from "./quote-provider.ts"

export function createCompositeProvider(providers: QuoteProvider[], accept: (quote: Quote) => boolean): QuoteProvider {
  return {
    name: providers.map((p) => p.name).join("+"),

    async getQuotes(marketTickers: string[]): Promise<QuoteResult> {
      const result: QuoteResult = { quotes: new Map(), rateLimited: false, failed: 0, sources: {} }
      let remaining = [...new Set(marketTickers)]

      for (const provider of providers) {
        if (remaining.length === 0) break
        const answer = await provider.getQuotes(remaining)
        result.failed += answer.failed

        for (const [symbol, quote] of answer.quotes) {
          if (!accept(quote)) continue
          result.quotes.set(symbol, quote)
          result.sources![provider.name] = (result.sources![provider.name] ?? 0) + 1
        }
        remaining = remaining.filter((t) => !result.quotes.has(t))

        // Only worth reporting if something is still unpriced afterwards; a
        // fallback that filled the gap means the run was fine.
        if (answer.rateLimited) result.rateLimited = true
      }

      if (remaining.length === 0) result.rateLimited = false
      return result
    },
  }
}
