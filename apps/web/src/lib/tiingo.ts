/**
 * End-of-day prices for mutual funds from Tiingo. Funds publish one price a day
 * (their net asset value, in the evening), so a daily close is all there is;
 * Massive, Alpaca and Finnhub don't cover them on their free plans.
 *
 * Tiingo answers one ticker per request and its free plan allows about 50 an
 * hour, so callers keep the number of tickers small. Free of database and
 * framework imports so the tests can stub `fetch`.
 */

const BASE_URL = process.env.TIINGO_BASE_URL ?? "https://api.tiingo.com"

/** Fund tickers are letters; share classes with a dot are written with a dash at Tiingo. */
const SYMBOL = /^[A-Z][A-Z0-9]{0,5}(\.[A-Z0-9]{1,2})?$/

export type FundClose = { price: number; asOf: string }

export type FundCloses = {
  closes: Map<string, FundClose>
  /** Tiingo says it doesn't have these. */
  unknown: Set<string>
  /** We hit the hourly allowance; whatever was gathered is returned. */
  rateLimited: boolean
  /** Requests that failed for any other reason. */
  failed: number
}

export async function tiingoFundCloses(
  tickers: string[],
  { apiKey, fetchImpl = fetch, timeoutMs = 8_000, baseUrl = BASE_URL }: { apiKey: string; fetchImpl?: typeof fetch; timeoutMs?: number; baseUrl?: string },
): Promise<FundCloses> {
  const out: FundCloses = { closes: new Map(), unknown: new Set(), rateLimited: false, failed: 0 }

  for (const ticker of [...new Set(tickers)].filter((t) => SYMBOL.test(t))) {
    if (out.rateLimited) break
    try {
      const response = await fetchImpl(`${baseUrl}/tiingo/daily/${encodeURIComponent(ticker.replace(".", "-"))}/prices`, {
        // A header, not the URL, so the key doesn't end up in request logs.
        headers: { Authorization: `Token ${apiKey}`, "Content-Type": "application/json" },
        cache: "no-store",
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (response.status === 429) {
        out.rateLimited = true
        continue
      }
      if (response.status === 404) {
        out.unknown.add(ticker)
        continue
      }
      if (!response.ok) {
        out.failed++
        continue
      }
      // Without a date range Tiingo returns the latest day, as a one-element list.
      const bars = (await response.json()) as { date?: string; close?: number; adjClose?: number }[]
      const bar = Array.isArray(bars) ? bars[bars.length - 1] : undefined
      if (!bar || typeof bar.close !== "number" || !(bar.close > 0) || typeof bar.date !== "string") {
        out.unknown.add(ticker)
        continue
      }
      out.closes.set(ticker, { price: bar.close, asOf: bar.date.slice(0, 10) })
    } catch {
      out.failed++
    }
  }
  return out
}
