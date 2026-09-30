import { NextResponse } from "next/server"
import { assertCronAuthorized, withPublic } from "@web/lib/api"

export const maxDuration = 30

/**
 * Asks each price provider one real question from the deployed app, where the
 * keys live, and reports what came back: HTTP status, latency, the price and
 * how old its timestamp is. Never returns a key or a raw response body beyond
 * a few numeric fields (and a short error text on failure).
 *
 * Run it by hand (the "Probe price providers" workflow) to answer "is this
 * provider actually working from production?" without guessing from logs.
 */
export const GET = withPublic<unknown>(async (request) => {
  assertCronAuthorized(request)
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "AAPL").toUpperCase().replace(/[^A-Z.]/g, "").slice(0, 8) || "AAPL"

  const config = {
    QUOTE_PROVIDER: process.env.QUOTE_PROVIDER ?? "(unset, defaults to finnhub)",
    FINNHUB_API_KEY: process.env.FINNHUB_API_KEY ? "set" : "MISSING",
    ALPACA_API_KEY: process.env.ALPACA_API_KEY ? "set" : "MISSING",
    ALPACA_API_SECRET: process.env.ALPACA_API_SECRET ? "set" : "MISSING",
    MASSIVE_API_KEY: process.env.MASSIVE_API_KEY ? "set" : "MISSING",
    LIVE_QUOTE_REFRESH_SECONDS: process.env.LIVE_QUOTE_REFRESH_SECONDS ?? "(default 900)",
    LIVE_QUOTE_CALLS_PER_MINUTE: process.env.LIVE_QUOTE_CALLS_PER_MINUTE ?? "(default 40)",
  }

  const time = async <T>(fn: () => Promise<T>) => {
    const started = Date.now()
    try {
      return { ...(await fn()), ms: Date.now() - started }
    } catch (error) {
      return { error: error instanceof Error ? error.message : "unknown", ms: Date.now() - started }
    }
  }

  const finnhub = process.env.FINNHUB_API_KEY
    ? await time(async () => {
        const response = await fetch(`https://finnhub.io/api/v1/quote?symbol=${symbol}`, {
          headers: { "X-Finnhub-Token": process.env.FINNHUB_API_KEY! },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        })
        const text = await response.text()
        if (!response.ok) return { status: response.status, body: text.slice(0, 160) }
        const q = JSON.parse(text) as { c?: number; pc?: number; dp?: number; t?: number }
        const lastTrade = q.t ? new Date(q.t * 1000).toISOString() : null
        return {
          status: response.status,
          price: q.c,
          previousClose: q.pc,
          changePercent: q.dp,
          lastTrade,
          ageMinutes: q.t ? Math.round((Date.now() - q.t * 1000) / 60_000) : null,
          note: q.c ? undefined : "all zeros: symbol unknown or no data on this plan",
        }
      })
    : { skipped: "no FINNHUB_API_KEY" }

  const alpaca =
    process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET
      ? await time(async () => {
          const response = await fetch(`https://data.alpaca.markets/v2/stocks/snapshots?symbols=${symbol}&feed=iex`, {
            headers: { "APCA-API-KEY-ID": process.env.ALPACA_API_KEY!, "APCA-API-SECRET-KEY": process.env.ALPACA_API_SECRET! },
            cache: "no-store",
            signal: AbortSignal.timeout(8_000),
          })
          const text = await response.text()
          if (!response.ok) return { status: response.status, body: text.slice(0, 160) }
          const raw = JSON.parse(text) as Record<string, unknown>
          const snap = ((raw.snapshots as Record<string, unknown> | undefined) ?? raw)[symbol] as { latestTrade?: { p?: number; t?: string }; prevDailyBar?: { c?: number } } | undefined
          const t = snap?.latestTrade?.t
          return {
            status: response.status,
            price: snap?.latestTrade?.p,
            previousClose: snap?.prevDailyBar?.c,
            lastTrade: t ?? null,
            ageMinutes: t ? Math.round((Date.now() - Date.parse(t.replace(/(\.\d{3})\d+/, "$1"))) / 60_000) : null,
            note: snap ? undefined : "no snapshot for this symbol on the IEX feed",
          }
        })
      : { skipped: "no ALPACA_API_KEY / ALPACA_API_SECRET" }

  const massive = process.env.MASSIVE_API_KEY
    ? await time(async () => {
        const response = await fetch(`https://api.massive.com/v2/aggs/ticker/${symbol}/prev?adjusted=true`, {
          headers: { Authorization: `Bearer ${process.env.MASSIVE_API_KEY}` },
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        })
        const text = await response.text()
        if (!response.ok) return { status: response.status, body: text.slice(0, 160) }
        const bar = (JSON.parse(text) as { results?: { c?: number; t?: number }[] }).results?.[0]
        return { status: response.status, close: bar?.c, sessionDate: bar?.t ? new Date(bar.t).toISOString().slice(0, 10) : null }
      })
    : { skipped: "no MASSIVE_API_KEY" }

  return NextResponse.json({ at: new Date().toISOString(), symbol, config, alpaca, finnhub, massive })
})
