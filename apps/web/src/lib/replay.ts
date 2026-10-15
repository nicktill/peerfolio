/**
 * Portfolio Replay: the maths behind walking through a range day by day.
 *
 * Value-only and honest. The app stores one snapshot per day (net worth, investable assets, net
 * flows), not historical positions, so a frame is only ever what was recorded that day: the value,
 * the time-weighted return (deposits removed) and numbers derived from those. Nothing is filled in:
 * a date that is missing from the return series has no frame, and a benchmark date that is missing
 * gives `null`, never an interpolated value.
 */

export type ReplaySpeed = 1 | 2 | 4
export const REPLAY_SPEEDS: readonly ReplaySpeed[] = [1, 2, 4]

export type ReplayFrame = {
  date: string
  /** Net worth that day, as recorded. Moves with deposits and withdrawals. */
  value: number
  /** Time-weighted return since the first frame, in percent (deposits removed). */
  indexedReturnPercent: number
  /** The benchmark's return over the same dates in percent, or null when it has no close for this date. */
  benchmarkReturnPercent: number | null
  /** Value change since the previous frame net of that day's flows; null on the first frame or when flows aren't known. */
  dayChangeAmount: number | null
  /** The day's time-weighted return in percent (deposits already removed); null on the first frame. */
  dayChangePercent: number | null
  /** How far the return level sits below its highest point so far, in percent (0 or negative). */
  drawdownFromPeakPercent: number
  /** The highest return level (indexed, 100 = start) reached up to and including this frame. */
  runningHigh: number
}

type Dated = { date: string }

export type ReplayInput = {
  /** Dollar history for the range. */
  history: (Dated & { netWorth: number })[]
  /** Return series for the range, indexed to 100 at the start (deposits removed). Sets the order of frames. */
  performance: (Dated & { indexed: number })[]
  /** Optional benchmark, indexed to 100 over the same window; dates it lacks stay null. */
  benchmark?: (Dated & { indexed: number })[] | null
  /** Optional net flows by date (deposits positive). Without them the dollar day change is unknown. */
  netFlows?: Record<string, number> | null
}

const finite = (v: number) => Number.isFinite(v)

/** One frame per date that has both a dollar value and a return. Dates missing from either are skipped. */
export function buildFrames(input: ReplayInput): ReplayFrame[] {
  const values = new Map(input.history.filter((p) => finite(p.netWorth)).map((p) => [p.date, p.netWorth]))
  const bench = input.benchmark?.length ? new Map(input.benchmark.filter((p) => finite(p.indexed)).map((p) => [p.date, p.indexed])) : null
  const flows = input.netFlows ?? null

  const frames: ReplayFrame[] = []
  let high = -Infinity
  let prevValue: number | null = null
  let prevIndexed: number | null = null

  for (const p of input.performance) {
    const value = values.get(p.date)
    if (value === undefined || !finite(p.indexed)) continue
    high = Math.max(high, p.indexed)

    const flow = flows?.[p.date]
    const dayChangeAmount = prevValue != null && flow != null && finite(flow) ? value - prevValue - flow : null
    const dayChangePercent = prevIndexed != null && prevIndexed > 0 ? (p.indexed / prevIndexed - 1) * 100 : null
    const b = bench?.get(p.date)

    frames.push({
      date: p.date,
      value,
      indexedReturnPercent: p.indexed - 100,
      benchmarkReturnPercent: b === undefined ? null : b - 100,
      dayChangeAmount,
      dayChangePercent,
      drawdownFromPeakPercent: high > 0 ? Math.min(0, (p.indexed / high - 1) * 100) : 0,
      runningHigh: high,
    })
    prevValue = value
    prevIndexed = p.indexed
  }
  return frames
}

/** Return minus benchmark in percentage points, or null when either is missing. */
export const gapPoints = (f: Pick<ReplayFrame, "indexedReturnPercent" | "benchmarkReturnPercent">): number | null =>
  f.benchmarkReturnPercent == null ? null : f.indexedReturnPercent - f.benchmarkReturnPercent

/** Keeps an index inside [0, count - 1]; 0 when there are no frames. */
export function clampIndex(i: number, count: number): number {
  if (count <= 0 || !Number.isFinite(i)) return 0
  return Math.max(0, Math.min(count - 1, Math.round(i)))
}

/** One manual step (or `step` steps) forwards or backwards, stopping at the ends. */
export function nextIndex(i: number, direction: 1 | -1, count: number, step = 1): number {
  return clampIndex(i + direction * Math.max(1, step), count)
}

/**
 * Days per second at a speed. 1x takes about a dozen seconds to cross the range (never fewer than
 * 3 days a second, so a short range doesn't crawl, never more than 30), and 2x / 4x are exact multiples.
 */
export function stepsPerSecond(speed: ReplaySpeed, count = 30): number {
  const base = Math.max(3, Math.min(30, count / 12))
  return base * speed
}

/** Next speed in the 1x → 2x → 4x → 1x cycle. */
export function nextSpeed(speed: ReplaySpeed): ReplaySpeed {
  return REPLAY_SPEEDS[(REPLAY_SPEEDS.indexOf(speed) + 1) % REPLAY_SPEEDS.length]!
}

/**
 * Moves a fractional playback position forward by `dtSeconds` and reports whether it hit the end.
 * The position is fractional so frame-rate jitter doesn't change the pace; show `Math.floor(position)`.
 */
export function advance(position: number, dtSeconds: number, speed: ReplaySpeed, count: number): { position: number; done: boolean } {
  const last = Math.max(0, count - 1)
  if (count <= 1 || !(dtSeconds > 0)) return { position: Math.max(0, Math.min(last, position)), done: position >= last }
  const next = Math.min(last, position + dtSeconds * stepsPerSecond(speed, count))
  return { position: next, done: next >= last }
}
