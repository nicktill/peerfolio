import "server-only"
import { and, asc, desc, eq, gte } from "drizzle-orm"
import { db } from "@web/db"
import { benchmarkPrices } from "@web/db/schema"
import { dailyCloses, MarketDataError } from "@web/lib/market-data"
import type { Close } from "@web/lib/benchmarks"

/**
 * Benchmark closes for charting, served from `benchmark_prices`. The provider is asked only for
 * what's missing (the early history once, then the days since the last stored close), at most once
 * every few hours per symbol, so viewers never each cost a request. A provider failure falls back
 * to whatever is stored; the comparison then says what it covers instead of guessing.
 */

const RETRY_MS = 6 * 3_600_000
const attempted = new Map<string, number>()
const dayMs = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10)

/** The most recent weekday strictly before `now` (UTC): the newest close that should exist. */
export function lastExpectedSession(now: Date): string {
  let ms = now.getTime() - dayMs
  for (;;) {
    const dow = new Date(ms).getUTCDay()
    if (dow !== 0 && dow !== 6) return iso(ms)
    ms -= dayMs
  }
}

const n = (v: string) => Number(v)

async function stored(symbol: string, from: string): Promise<Close[]> {
  const rows = await db
    .select({ date: benchmarkPrices.date, close: benchmarkPrices.close })
    .from(benchmarkPrices)
    .where(and(eq(benchmarkPrices.symbol, symbol), gte(benchmarkPrices.date, from)))
    .orderBy(asc(benchmarkPrices.date))
  return rows.map((r) => ({ date: r.date, close: n(r.close) }))
}

/**
 * Closes from a week before `from` (so the portfolio's first day has a prior close to index to) to now.
 * `from` is YYYY-MM-DD.
 */
export async function benchmarkCloses(symbol: string, from: string, now = new Date()): Promise<Close[]> {
  const start = iso(Date.parse(`${from}T12:00:00Z`) - 8 * dayMs)
  let rows = await stored(symbol, start)

  const [edge] = await db
    .select({ first: benchmarkPrices.date })
    .from(benchmarkPrices)
    .where(eq(benchmarkPrices.symbol, symbol))
    .orderBy(asc(benchmarkPrices.date))
    .limit(1)
  const [latest] = await db
    .select({ last: benchmarkPrices.date })
    .from(benchmarkPrices)
    .where(eq(benchmarkPrices.symbol, symbol))
    .orderBy(desc(benchmarkPrices.date))
    .limit(1)

  const needsBackfill = !edge || edge.first > start
  const needsForward = !latest || latest.last < lastExpectedSession(now)
  const last = attempted.get(symbol) ?? 0
  if ((needsBackfill || needsForward) && now.getTime() - last > RETRY_MS) {
    attempted.set(symbol, now.getTime())
    // One request covers both gaps: from the earlier of the backfill start and the day after the newest stored close.
    const fetchFrom = needsBackfill || !latest ? start : iso(Date.parse(`${latest.last}T12:00:00Z`) + dayMs)
    try {
      const fresh = await dailyCloses(symbol, fetchFrom, iso(now.getTime()))
      if (fresh.length > 0) {
        await db
          .insert(benchmarkPrices)
          .values(fresh.map((c) => ({ symbol, date: c.date, close: c.close.toFixed(6) })))
          .onConflictDoNothing()
        rows = await stored(symbol, start)
      }
    } catch (error) {
      console.error(`[benchmarks] ${symbol} history fetch failed:`, error instanceof MarketDataError ? error.message : error)
    }
  }
  return rows
}
