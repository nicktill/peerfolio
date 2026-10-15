/**
 * Volatility and drawdown from the portfolio's own tracked history. The input
 * is the time-weighted series (deposits already divided out), so a contribution
 * never reads as a gain or a swing. Pure, so it can be tested directly.
 */

export type IndexedPoint = { date: string; indexed: number }

export type RiskMetrics = {
  /** Return steps used (consecutive tracked days; steps across long gaps are left out). */
  observations: number
  /** Annualized standard deviation of daily returns, in percent; null until there are enough steps. */
  volatility: number | null
  /** Largest peak-to-trough fall of the indexed series, as a positive percent; null when the series is too short. */
  maxDrawdown: number | null
  best: { date: string; percent: number } | null
  worst: { date: string; percent: number } | null
}

/** Fewer steps than this and a standard deviation is noise, so none is reported. */
export const MIN_VOL_OBSERVATIONS = 20
export const MIN_DRAWDOWN_POINTS = 5
/** A weekend is 3 days; a longer gap means missing snapshots, not one day's move. */
const MAX_GAP_DAYS = 4
const TRADING_DAYS = 252

const dayMs = 86_400_000
const gapDays = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / dayMs)

export function riskMetrics(series: IndexedPoint[]): RiskMetrics | null {
  if (series.length < 2) return null

  const steps: { date: string; r: number }[] = []
  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1]!
    const cur = series[i]!
    if (!(prev.indexed > 0) || gapDays(prev.date, cur.date) > MAX_GAP_DAYS) continue
    steps.push({ date: cur.date, r: cur.indexed / prev.indexed - 1 })
  }

  let volatility: number | null = null
  if (steps.length >= MIN_VOL_OBSERVATIONS) {
    const mean = steps.reduce((s, x) => s + x.r, 0) / steps.length
    const variance = steps.reduce((s, x) => s + (x.r - mean) ** 2, 0) / (steps.length - 1)
    volatility = Math.sqrt(variance) * Math.sqrt(TRADING_DAYS) * 100
  }

  let maxDrawdown: number | null = null
  if (series.length >= MIN_DRAWDOWN_POINTS) {
    let peak = series[0]!.indexed
    let worst = 0
    for (const p of series) {
      if (p.indexed > peak) peak = p.indexed
      if (peak > 0) worst = Math.max(worst, (peak - p.indexed) / peak)
    }
    maxDrawdown = worst * 100
  }

  const best = steps.reduce<{ date: string; r: number } | null>((a, s) => (!a || s.r > a.r ? s : a), null)
  const worst = steps.reduce<{ date: string; r: number } | null>((a, s) => (!a || s.r < a.r ? s : a), null)
  return {
    observations: steps.length,
    volatility,
    maxDrawdown,
    best: best ? { date: best.date, percent: best.r * 100 } : null,
    worst: worst ? { date: worst.date, percent: worst.r * 100 } : null,
  }
}
