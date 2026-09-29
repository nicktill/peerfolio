import { after } from "next/server"
import { eq } from "drizzle-orm"
import { db, securities } from "@web/db"
import { isNewerClose } from "@web/lib/market-data"
import { revalueSecurities } from "@web/lib/positions"
import { acceptQuote, createQuoteProvider, isUsMarketOpen, quoteDate } from "@web/lib/quote-provider"
import { claimLiveQuotesSql } from "@web/lib/stale-prices"

/**
 * Keeps prices moving while the market is open.
 *
 * The provider is only ever called from here, on our server, and every user
 * reads the stored result, so the provider cost stays flat as users grow. A
 * live price is stored in the same place as a daily close (`close_price`, dated
 * today); the nightly job replaces it with the official close, and nothing
 * ever steps a price back to an older date (`isNewerClose`).
 *
 * Everything here degrades to "no change": no provider, market closed, a
 * rate limit or an outage all leave the last stored price in place.
 */

const DEFAULT_MAX_SYMBOLS = 40

/**
 * How stale a stored price may get before the next page load refreshes it.
 * One provider call per ticker, so 30s costs 2 calls a minute per ticker: fine
 * for a few dozen tickers on Finnhub's 60-a-minute free plan.
 */
export const REFRESH_SECONDS = 30

/** Refreshes prices claimed for this interval. Safe to call from any number of servers at once. */
export async function refreshLivePrices({
  now = new Date(),
  maxAgeSeconds = REFRESH_SECONDS,
  maxSymbols = Number(process.env.LIVE_QUOTE_MAX_SYMBOLS) || DEFAULT_MAX_SYMBOLS,
}: { now?: Date; maxAgeSeconds?: number; maxSymbols?: number } = {}) {
  if (!isUsMarketOpen(now)) return { skipped: "market closed" as const }
  const provider = createQuoteProvider(process.env)
  if (!provider) return { skipped: "no provider" as const }

  const claimed = [...(await db.execute<{ id: string; market_ticker: string; close_price_as_of: string | null }>(claimLiveQuotesSql(maxAgeSeconds, maxSymbols)))]
  if (claimed.length === 0) return { provider: provider.name, claimed: 0, refreshed: 0 }

  const result = await provider.getQuotes(claimed.map((r) => r.market_ticker))

  const updated: string[] = []
  let rejected = 0
  let rejectedExample: string | undefined
  for (const row of claimed) {
    const quote = result.quotes.get(row.market_ticker)
    if (!acceptQuote(quote, now)) {
      rejected++
      const raw = result.quotes.get(row.market_ticker)
      rejectedExample ??= raw ? `${row.market_ticker} price=${raw.price} asOf=${raw.asOf}` : `${row.market_ticker} (no quote)`
      continue
    }
    if (!isNewerClose(quoteDate(quote), row.close_price_as_of)) continue
    await db
      .update(securities)
      .set({ closePrice: quote.price.toString(), closePriceAsOf: quoteDate(quote), updatedAt: new Date() })
      .where(eq(securities.id, row.id))
    updated.push(row.id)
  }
  await revalueSecurities(updated)

  if (result.rateLimited) console.warn(`[quotes] ${provider.name} rate limited us after ${result.quotes.size}/${claimed.length}`)
  return { provider: provider.name, claimed: claimed.length, refreshed: updated.length, rejected, rejectedExample, rateLimited: result.rateLimited, failed: result.failed }
}

let warnedNoProvider = false

/**
 * One line per run that did or tried something, so "why aren't prices moving?"
 * can be answered from the logs. Quiet when the market is closed.
 */
function logRun(run: Awaited<ReturnType<typeof refreshLivePrices>>) {
  if ("skipped" in run) {
    if (run.skipped === "no provider" && !warnedNoProvider) {
      warnedNoProvider = true
      console.warn("[quotes] no live provider configured (set FINNHUB_API_KEY); prices stay at the last close")
    }
    return
  }
  if (run.claimed === 0) return
  const problems = [
    run.rateLimited ? "rate limited" : "",
    run.failed ? `${run.failed} failed` : "",
    run.rejected ? `${run.rejected} rejected (${run.rejectedExample})` : "",
  ].filter(Boolean)
  const line = `[quotes] ${run.provider}: refreshed ${run.refreshed}/${run.claimed}${problems.length ? ` · ${problems.join(", ")}` : ""}`
  if (run.refreshed === 0 || problems.length) console.warn(line)
  else console.info(line)
}

/**
 * Queues a live refresh to run after the response has been sent, so opening a
 * page never waits on the provider. The next poll (or page open) sees the result.
 */
export function scheduleLiveRefresh() {
  try {
    after(async () => {
      try {
        const run = await refreshLivePrices()
        logRun(run)
      } catch (error) {
        console.error("[quotes] live refresh failed:", error instanceof Error ? error.message : error)
      }
    })
  } catch {
    // Outside a request there is nothing to attach to; the next request will do it.
  }
}

/**
 * The current price of one stock, fetched now if the stored one isn't fresh
 * enough, or null when live prices aren't available (market closed, no
 * provider, ticker unknown, outage).
 *
 * A trade fills at this price *and* it's written to the shared price row, so
 * the fill and everyone's valuation use the same number. Filling at an older
 * price than the one people are valued at would show up as an instant gain or
 * loss, the one thing buying must never do. Requires the security row to exist
 * (call `ensurePriced` first).
 */
export async function ensureLivePrice(marketTicker: string, { maxAgeSeconds = 0, now = new Date() }: { maxAgeSeconds?: number; now?: Date } = {}) {
  try {
    if (!isUsMarketOpen(now)) return null
    const provider = createQuoteProvider(process.env)
    if (!provider) return null

    const securityId = `mkt:${marketTicker}`
    const existing = await db.query.securities.findFirst({ where: eq(securities.id, securityId) })
    if (!existing) return null

    const today = now.toISOString().slice(0, 10)
    const fresh =
      maxAgeSeconds > 0 &&
      existing.closePrice &&
      existing.closePriceAsOf?.slice(0, 10) === today &&
      now.getTime() - existing.updatedAt.getTime() < maxAgeSeconds * 1000
    if (fresh) return { price: Number(existing.closePrice), asOf: existing.closePriceAsOf!.slice(0, 10) }

    const quote = (await provider.getQuotes([marketTicker])).quotes.get(marketTicker)
    if (!acceptQuote(quote, now)) return null
    if (!isNewerClose(quoteDate(quote), existing.closePriceAsOf)) return null

    await db
      .update(securities)
      .set({ closePrice: quote.price.toString(), closePriceAsOf: quoteDate(quote), updatedAt: new Date() })
      .where(eq(securities.id, securityId))
    await revalueSecurities([securityId])
    return { price: quote.price, asOf: quoteDate(quote) }
  } catch (error) {
    console.error("[quotes] live price lookup failed:", error instanceof Error ? error.message : error)
    return null
  }
}
