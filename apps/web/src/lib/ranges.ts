/**
 * Pure return math and range helpers.
 *
 * Deliberately free of database imports: client components need RANGES and the
 * Range type, and importing them from a module that touches Postgres drags the
 * driver into the browser bundle.
 */

export const RANGES = ["1W", "1M", "3M", "6M", "1Y", "ALL"] as const
export type Range = (typeof RANGES)[number]

export const isRange = (v: string): v is Range => (RANGES as readonly string[]).includes(v)

const DAYS: Record<Exclude<Range, "ALL">, number> = { "1W": 7, "1M": 30, "3M": 90, "6M": 180, "1Y": 365 }

/** Inclusive start date for a range, or null for ALL. */
export function rangeStart(range: Range, from = new Date()): string | null {
  if (range === "ALL") return null
  const d = new Date(from)
  d.setUTCDate(d.getUTCDate() - DAYS[range])
  return d.toISOString().slice(0, 10)
}

const DAY_MS = 86_400_000

/** Whole days from one YYYY-MM-DD date to another. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)

/**
 * Which ranges have enough history behind them to mean what they say. A range
 * is available once tracking has lasted at least its length; ALL always is. A
 * "1M" view of two days of data would be the same line as "1W" with a
 * misleading label.
 */
export function rangeAvailability(firstDate: string | null, today: string): Record<Range, boolean> {
  const tracked = firstDate ? Math.max(0, daysBetween(firstDate, today)) : 0
  const out = { ALL: true } as Record<Range, boolean>
  for (const range of RANGES) if (range !== "ALL") out[range] = tracked >= DAYS[range]
  return out
}

/** The longest available range up to one month, or ALL while history is younger than that. */
export function defaultRange(firstDate: string | null, today: string): Range {
  return rangeAvailability(firstDate, today)["1M"] ? "1M" : "ALL"
}

export type SnapshotPoint = {
  date: string
  netWorth: number
  investableAssets: number
  netFlows: number
  /** True when every account behind this day was institution-linked. */
  isVerified: boolean
}

export type ReturnSeriesPoint = { date: string; value: number; indexed: number }

export type ReturnSummary = {
  /** Time-weighted return over the window, as a percentage. */
  percent: number
  /** Growth of 100 units, for charting members on one axis. */
  series: ReturnSeriesPoint[]
  /** Snapshot days available — the honest denominator for "is this real yet". */
  days: number
  startValue: number
  endValue: number
}

const EMPTY: ReturnSummary = { percent: 0, series: [], days: 0, startValue: 0, endValue: 0 }

/**
 * Chain-linked time-weighted return.
 *
 * Each period's return divides out the cash that moved in or out, so adding
 * money neither helps nor hurts your score. This is the whole reason a
 * leaderboard here means something: it ranks decisions, not deposits.
 *
 *   r_t = (V_t - F_t) / V_{t-1} - 1
 *   TWR = Π(1 + r_t) - 1
 *
 * Periods opening at a non-positive value are skipped rather than treated as
 * infinite return.
 */
export function timeWeightedReturn(
  points: SnapshotPoint[],
  basis: "investableAssets" | "netWorth" = "investableAssets",
): ReturnSummary {
  if (points.length < 2) {
    const only = points[0]
    if (!only) return EMPTY
    const v = only[basis]
    return { percent: 0, series: [{ date: only.date, value: v, indexed: 100 }], days: 1, startValue: v, endValue: v }
  }

  const series: ReturnSeriesPoint[] = []
  let cumulative = 1

  const first = points[0]!
  series.push({ date: first.date, value: first[basis], indexed: 100 })

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!
    const curr = points[i]!
    const opening = prev[basis]

    if (opening > 0) {
      const periodReturn = (curr[basis] - curr.netFlows) / opening - 1
      // Clamp per-period moves to ±100%: a mis-signed flow or a mid-window
      // account disconnect should not detonate the whole chain.
      cumulative *= 1 + Math.max(-1, Math.min(1, periodReturn))
    }

    series.push({ date: curr.date, value: curr[basis], indexed: cumulative * 100 })
  }

  const last = points[points.length - 1]!
  return {
    percent: (cumulative - 1) * 100,
    series,
    days: points.length,
    startValue: first[basis],
    endValue: last[basis],
  }
}

/**
 * Adds today's live value as the last point, so a return reflects the day in
 * progress instead of waiting for the nightly snapshot.
 *
 * Live balances only change through a sync, an edit (both write a snapshot with
 * their cash flow) or a reprice, so the difference from the last snapshot is
 * market movement. A snapshot already dated today keeps its recorded flows and
 * takes the live balances; a later-dated one is left alone. With no history
 * there is nothing to compare to, so nothing is added.
 */
export function withLivePoint(
  points: SnapshotPoint[],
  live: Pick<SnapshotPoint, "netWorth" | "investableAssets" | "isVerified">,
  today: string,
): SnapshotPoint[] {
  const last = points[points.length - 1]
  if (!last || last.date > today) return points
  if (last.date === today) return [...points.slice(0, -1), { ...last, ...live }]
  return [...points, { date: today, ...live, netFlows: 0 }]
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Downsamples an indexed series to at most `max` points, always keeping the ends. */
export function sparkline(series: ReturnSeriesPoint[], max = 24): number[] {
  if (series.length <= max) return series.map((p) => round2(p.indexed))

  const step = (series.length - 1) / (max - 1)
  return Array.from({ length: max }, (_, i) => round2(series[Math.round(i * step)]!.indexed))
}

/**
 * Time-weighted return for every range, from a single already-loaded series.
 *
 * Callers that need more than one window should load snapshots once and use
 * this, rather than querying per range — the windows all read the same rows.
 */
export function returnsByRange(points: SnapshotPoint[]): Record<Range, number> {
  const out = {} as Record<Range, number>

  for (const range of RANGES) {
    const start = rangeStart(range)
    const scoped = start ? points.filter((p) => p.date >= start) : points
    out[range] = timeWeightedReturn(scoped).percent
  }

  return out
}

