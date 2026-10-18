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

/** Reduces timed samples to at most about `max` values. Buckets are equal slices of time (not of sample count) and each keeps its low and high, so spikes survive; first and last samples are always kept. */
export function downsampleByTime(samples: { t: number; v: number }[], max = 60): number[] {
  const s = samples.filter((x) => Number.isFinite(x.v) && Number.isFinite(x.t)).sort((a, b) => a.t - b.t)
  if (s.length <= max) return s.map((x) => x.v)
  const first = s[0]!
  const last = s[s.length - 1]!
  const buckets = Math.max(1, Math.floor((max - 2) / 2))
  const span = last.t - first.t || 1
  const lo: ({ t: number; v: number } | undefined)[] = new Array(buckets)
  const hi: ({ t: number; v: number } | undefined)[] = new Array(buckets)
  for (let i = 1; i < s.length - 1; i++) {
    const x = s[i]!
    const b = Math.min(buckets - 1, Math.floor(((x.t - first.t) / span) * buckets))
    if (!lo[b] || x.v < lo[b]!.v) lo[b] = x
    if (!hi[b] || x.v > hi[b]!.v) hi[b] = x
  }
  const out = [first.v]
  for (let b = 0; b < buckets; b++) {
    const a = lo[b]
    const c = hi[b]
    if (!a || !c) continue
    if (a === c) out.push(a.v)
    else if (a.t <= c.t) out.push(a.v, c.v)
    else out.push(c.v, a.v)
  }
  out.push(last.v)
  return out
}

const clamp01 = (p: number) => Math.min(1, Math.max(0, p))
const side = (values: number[], flip: boolean) => values.map((p) => clamp01(flip ? 1 - p : p))

/** Appends the current live probability (home, 0..1) so the line ends where the win-probability bar does. Ignores bad values. */
export function withLive(points: number[], live: number | null | undefined): number[] {
  return live != null && Number.isFinite(live) ? [...points, clamp01(live)] : points
}

/** Vertical window for a series: at least `minSpan` tall, centred on the data, shifted to stay inside 0..1. */
export function sparkScale(values: number[], minSpan = 0.12): { lo: number; hi: number } {
  if (!values.length) return { lo: 0.5 - minSpan / 2, hi: 0.5 + minSpan / 2 }
  const q = values.map(clamp01)
  const min = Math.min(...q)
  const max = Math.max(...q)
  const span = Math.min(1, Math.max(max - min, minSpan))
  let lo = (min + max) / 2 - span / 2
  if (lo < 0) lo = 0
  if (lo + span > 1) lo = 1 - span
  return { lo, hi: lo + span }
}

/** Whole-point change from the first to the last value of a team's series (flip mirrors it). */
export function pointChange(values: number[], flip = false): number {
  if (values.length < 2) return 0
  const v = side(values, flip)
  const d = Math.round((v[v.length - 1]! - v[0]!) * 100)
  return d === 0 ? 0 : d
}

export type TrendDirection = "up" | "down" | "flat"
/** Up or down only when the move is a full point or more; anything smaller reads as flat. */
export function trendDirection(change: number): TrendDirection {
  return change >= 1 ? "up" : change <= -1 ? "down" : "flat"
}

/** Signed label such as "+4" or "-3"; empty below one point. */
export function changeLabel(change: number): string {
  return Math.abs(change) < 1 ? "" : change > 0 ? `+${change}` : `${change}`
}

/** Plain-language description of the line, e.g. "Texans win chance up 4 points since kickoff". */
export function trendDescription(team: string, change: number): string {
  const n = Math.abs(change)
  if (trendDirection(change) === "flat") return `${team} win chance roughly unchanged since kickoff`
  return `${team} win chance ${change > 0 ? "up" : "down"} ${n} ${n === 1 ? "point" : "points"} since kickoff`
}

export type Spark = { d: string; last: [number, number]; startY: number; change: number; direction: TrendDirection }

/** Sparkline geometry in pixels, auto-scaled to the series range. `startY` is the height of the first value (the reference line). */
export function sparkline(values: number[], flip = false, w = 64, h = 26, pad = 3): Spark | null {
  if (values.length < 2) return null
  const v = side(values, flip)
  const { lo, hi } = sparkScale(v)
  const n = v.length - 1
  const y = (q: number) => pad + (1 - (q - lo) / (hi - lo)) * (h - 2 * pad)
  const pts = v.map((q, i): [number, number] => [pad + (i / n) * (w - 2 * pad), y(q)])
  const change = pointChange(values, flip)
  return {
    d: pts.map(([x, py], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${py.toFixed(1)}`).join(""),
    last: pts[n]!,
    startY: y(v[0]!),
    change,
    direction: trendDirection(change),
  }
}

export const MIN_TREND_POINTS = 8
