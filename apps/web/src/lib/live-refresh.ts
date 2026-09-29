import { isUsMarketOpen } from "@web/lib/market-hours"

/**
 * How often an open page should re-read its numbers: every 30 seconds while the
 * US market is open, when prices are moving, and at `closedMs` otherwise (or never).
 * Works out the answer each render, so a page left open across 9:30 or 4:00 ET
 * changes pace by itself.
 */
export function liveRefreshMs(closedMs?: number): number | undefined {
  return isUsMarketOpen(new Date()) ? 30_000 : closedMs
}
