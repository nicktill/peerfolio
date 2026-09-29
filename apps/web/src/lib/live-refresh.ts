import { isUsMarketOpen } from "@web/lib/market-hours"

/**
 * How often an open page should re-read its numbers: every minute while the US
 * market is open, when prices are moving (stored prices refresh on a slower,
 * staggered schedule, so a tick or two changes each minute), and at `closedMs`
 * otherwise (or never).
 * Works out the answer each render, so a page left open across 9:30 or 4:00 ET
 * changes pace by itself.
 */
export function liveRefreshMs(closedMs?: number): number | undefined {
  return isUsMarketOpen(new Date()) ? 60_000 : closedMs
}
