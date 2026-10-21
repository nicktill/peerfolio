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

export type Sample = { t: number; v: number }

/** Reduces timed samples to at most about `max` samples. Buckets are equal slices of time (not of sample count) and each keeps its low and high, so spikes survive; first and last samples are always kept. */
export function downsampleSamples(samples: Sample[], max = 60): Sample[] {
  const s = samples.filter((x) => Number.isFinite(x.v) && Number.isFinite(x.t)).sort((a, b) => a.t - b.t)
  if (s.length <= max) return s
  const first = s[0]!
  const last = s[s.length - 1]!
  const buckets = Math.max(1, Math.floor((max - 2) / 2))
  const span = last.t - first.t || 1
  const lo: (Sample | undefined)[] = new Array(buckets)
  const hi: (Sample | undefined)[] = new Array(buckets)
  for (let i = 1; i < s.length - 1; i++) {
    const x = s[i]!
    const b = Math.min(buckets - 1, Math.floor(((x.t - first.t) / span) * buckets))
    if (!lo[b] || x.v < lo[b]!.v) lo[b] = x
    if (!hi[b] || x.v > hi[b]!.v) hi[b] = x
  }
  const out: Sample[] = [first]
  for (let b = 0; b < buckets; b++) {
    const a = lo[b]
    const c = hi[b]
    if (!a || !c) continue
    if (a === c) out.push(a)
    else if (a.t <= c.t) out.push(a, c)
    else out.push(c, a)
  }
  out.push(last)
  return out
}

/** The values of `downsampleSamples`, for callers that only need the shape. */
export function downsampleByTime(samples: Sample[], max = 60): number[] {
  return downsampleSamples(samples, max).map((x) => x.v)
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

export type GameChartGeometry = { home: string; away: string; homeEnd: [number, number]; awayEnd: [number, number]; midY: number; homePct: number; awayPct: number; span: number }

/**
 * Geometry for the combined game chart: both teams' win chance as step lines on one time axis (x is real time, not sample
 * count). `series` is the home chance; away is its mirror. The vertical window is centred on 50% and only as tall as the
 * data needs (never under ±15 points), so a quiet game reads quiet. `live` (home, 0..1) is appended as the newest point.
 */
export function gameChart(series: Sample[], live: number | null | undefined, nowMs: number, w = 300, h = 64, padX = 2, padY = 6): GameChartGeometry | null {
  const pts = series.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v)).map((x) => ({ t: x.t, v: clamp01(x.v) }))
  if (live != null && Number.isFinite(live) && Number.isFinite(nowMs) && (!pts.length || nowMs > pts[pts.length - 1]!.t)) pts.push({ t: nowMs, v: clamp01(live) })
  if (pts.length < MIN_TREND_POINTS) return null
  const t0 = pts[0]!.t
  const span = Math.max(1, pts[pts.length - 1]!.t - t0)
  const half = Math.max(0.15, Math.min(0.5, Math.max(...pts.map((p) => Math.abs(p.v - 0.5))) + 0.05))
  const x = (t: number) => padX + ((t - t0) / span) * (w - 2 * padX)
  const y = (q: number) => padY + (1 - (q - (0.5 - half)) / (2 * half)) * (h - 2 * padY)
  const step = (vals: number[]) => pts.map((p, i) => (i === 0 ? `M${x(p.t).toFixed(1)} ${y(vals[i]!).toFixed(1)}` : `H${x(p.t).toFixed(1)}V${y(vals[i]!).toFixed(1)}`)).join("")
  const hv = pts.map((p) => p.v)
  const av = pts.map((p) => 1 - p.v)
  const last = pts[pts.length - 1]!
  return {
    home: step(hv),
    away: step(av),
    homeEnd: [x(last.t), y(last.v)],
    awayEnd: [x(last.t), y(1 - last.v)],
    midY: y(0.5),
    homePct: Math.round(last.v * 100),
    awayPct: 100 - Math.round(last.v * 100),
    span,
  }
}

export type HistoryBand = { away: string; line: string; awayPct: number; homePct: number }

/**
 * The win-chance bar drawn as history: one stacked band whose top (away) and bottom (home) shares follow the market over
 * real time and end at today's split. `away` is the closed polygon for the away share (everything above the step line);
 * the home share is whatever lies below it. `series` is the home chance (0..1); `live` is appended as the newest point.
 */
export function historyBand(series: Sample[], live: number | null | undefined, nowMs: number, w = 300, h = 16): HistoryBand | null {
  const pts = series.filter((x) => Number.isFinite(x.t) && Number.isFinite(x.v)).map((x) => ({ t: x.t, v: clamp01(x.v) }))
  if (live != null && Number.isFinite(live) && Number.isFinite(nowMs) && (!pts.length || nowMs > pts[pts.length - 1]!.t)) pts.push({ t: nowMs, v: clamp01(live) })
  if (pts.length < MIN_TREND_POINTS) return null
  const t0 = pts[0]!.t
  const span = Math.max(1, pts[pts.length - 1]!.t - t0)
  const x = (t: number) => ((t - t0) / span) * w
  const y = (home: number) => (1 - home) * h
  const line = pts.map((p, i) => (i === 0 ? `M${x(p.t).toFixed(1)} ${y(p.v).toFixed(1)}` : `H${x(p.t).toFixed(1)}V${y(p.v).toFixed(1)}`)).join("")
  const last = pts[pts.length - 1]!
  const homePct = Math.round(last.v * 100)
  return { line, away: `${line}H${w}V0H0Z`, awayPct: 100 - homePct, homePct }
}
