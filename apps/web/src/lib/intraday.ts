/**
 * Today's path for a portfolio, from 5-minute bars of what it holds. For each tracked position the dollar move
 * since the previous close is quantity × (price now − previous close); summed over a shared time grid it is how
 * much the day has added or taken away at each moment. Prices carry forward between bars (a thinly traded
 * ticker has gaps), and a position with no bars simply doesn't move on the chart. Pure, so it can be tested.
 */

export type IntradayPosition = { ticker: string; quantity: number; previousClose: number }
export type Bar = { t: string; c: number }
export type IntradayPoint = { t: string; delta: number }

export function intradayDeltas(positions: IntradayPosition[], bars: Map<string, Bar[]>): IntradayPoint[] {
  const tracked = positions.filter((p) => (bars.get(p.ticker)?.length ?? 0) > 0)
  if (tracked.length === 0) return []

  const grid = [...new Set(tracked.flatMap((p) => bars.get(p.ticker)!.map((b) => b.t)))].sort()
  const cursor = new Map<string, number>()
  const last = new Map<string, number>(tracked.map((p) => [p.ticker, p.previousClose]))

  return grid.map((t) => {
    let delta = 0
    for (const p of tracked) {
      const series = bars.get(p.ticker)!
      let i = cursor.get(p.ticker) ?? 0
      while (i < series.length && series[i]!.t <= t) {
        last.set(p.ticker, series[i]!.c)
        i++
      }
      cursor.set(p.ticker, i)
      delta += p.quantity * (last.get(p.ticker)! - p.previousClose)
    }
    return { t, delta }
  })
}
