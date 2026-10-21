import { normalizeQuote, pairProbability } from './quote.ts'
import { SOURCE_PRIORITY, type LiveSource, type NormalizedQuote } from './types.ts'
import type { QuoteRow } from './view.ts'
import { downsampleSamples, type Sample } from './trend.ts'

export type HistoryQuote = Omit<QuoteRow, "fetchedTs" | "sourceTs"> & { fetchedTs: Date | string; sourceTs: Date | string | null }

/** Rebuild historical probabilities with the same paired-book normalization used for current odds. */
export function quoteHistory(rows: HistoryQuote[], requestedSource?: LiveSource): { source: LiveSource | null; series: Sample[] } {
  const ticks = new Map<string, { source: LiveSource; sides: Map<string, NormalizedQuote> }>()
  for (const row of rows) {
    if (!SOURCE_PRIORITY.includes(row.source as LiveSource) || row.market !== 'moneyline') continue
    if (requestedSource && row.source !== requestedSource) continue
    const source = row.source as LiveSource
    const fetchedTs = new Date(row.fetchedTs)
    const sourceTs = row.sourceTs == null ? null : new Date(row.sourceTs)
    if (!Number.isFinite(fetchedTs.getTime()) || (sourceTs && !Number.isFinite(sourceTs.getTime()))) continue
    const key = `${source}:${fetchedTs.getTime()}`
    let tick = ticks.get(key)
    if (!tick) { tick = { source, sides: new Map() }; ticks.set(key, tick) }
    tick.sides.set(row.selection, normalizeQuote({ ...row, source, fetchedTs, sourceTs, selection: row.selection as 'home' | 'away' | 'draw', mid: source === 'espn' ? row.mid : undefined }, fetchedTs))
  }
  const bySource = new Map<LiveSource, Sample[]>()
  for (const tick of ticks.values()) {
    // A two-team chart cannot mirror a soccer home probability into away while a draw is possible.
    if (tick.sides.has('draw')) continue
    const pair = pairProbability(tick.sides.get('home'), tick.sides.get('away'))
    if (!pair || pair.freshness !== 'live' || !['high', 'medium'].includes(pair.confidence) || pair.homeProb <= 0 || pair.homeProb >= 1) continue
    const samples = bySource.get(tick.source) ?? []
    samples.push({ t: pair.asOf.getTime(), v: pair.homeProb })
    bySource.set(tick.source, samples)
  }
  for (const samples of bySource.values()) samples.sort((a, b) => a.t - b.t)
  // Prefer the source requested by the live card. Without one, choose the most recent usable source, not the busiest old source.
  const source = requestedSource ?? [...bySource.keys()].sort((a, b) => (bySource.get(b)!.at(-1)!.t - bySource.get(a)!.at(-1)!.t) || SOURCE_PRIORITY.indexOf(a) - SOURCE_PRIORITY.indexOf(b))[0] ?? null
  const unique = new Map((source ? bySource.get(source) ?? [] : []).map(sample => [sample.t, sample]))
  return { source, series: downsampleSamples([...unique.values()], 90) }
}
