/** Pure helpers for the faded win-probability trend lines. Display only. */

/** Picks the source with the most points, so a game switching feeds does not draw two interleaved lines. */
export function dominantSource<T extends { source: string }>(rows: T[]): T[] {
  const counts = new Map<string, number>()
  for (const r of rows) counts.set(r.source, (counts.get(r.source) ?? 0) + 1)
  let best = ""
  let n = -1
  for (const [s, c] of counts) {
    if (c > n) {
      best = s
      n = c
    }
  }
  return rows.filter((r) => r.source === best)
}

/** Reduces a series to at most `max` points spanning all of it: each bucket keeps its last value, the first point is kept. */
export function downsample(values: number[], max = 60): number[] {
  const v = values.filter((x) => Number.isFinite(x))
  if (v.length <= max) return v
  const out: number[] = [v[0]]
  const buckets = max - 1
  const span = v.length - 1
  for (let b = 1; b <= buckets; b++) out.push(v[Math.round((b * span) / buckets)])
  return out
}

/** SVG path for probabilities in 0..1 (1 at the top) on a 0..100 by 0..100 box, with 8% vertical padding. */
export function trendPath(values: number[], flip = false): string {
  if (values.length < 2) return ""
  const last = values.length - 1
  return values
    .map((p, i) => {
      const q = Math.min(1, Math.max(0, flip ? 1 - p : p))
      const x = (i / last) * 100
      const y = 8 + (1 - q) * 84
      return `${i ? "L" : "M"}${x.toFixed(2)} ${y.toFixed(2)}`
    })
    .join("")
}

export const MIN_TREND_POINTS = 8
