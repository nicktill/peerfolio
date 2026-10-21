import assert from 'node:assert/strict'
import { test } from 'node:test'
import { quoteHistory } from './history.ts'
import type { QuoteRow } from './view.ts'
const at = new Date('2026-10-21T03:00:00Z')
function book(selection: string, mid: number, options: Partial<QuoteRow> = {}): QuoteRow {
 return { market: 'moneyline', selection, source: 'kalshi', bid: mid - 0.005, ask: mid + 0.005, mid, fetchedTs: at, sourceTs: at, ...options }
}
test('empty or wide closing books never create a fake return to 50 percent', () => {
 const good = [book('home', 0.995), book('away', 0.005)]
 const end = new Date(at.getTime() + 10000)
 const bad = ['home', 'away'].map(side => book(side, 0.5, { bid: 0, ask: 1, fetchedTs: end, sourceTs: end }))
 assert.deepEqual(quoteHistory([...good, ...bad]).series, [{ t: at.getTime(), v: 0.995 }])
})
test('history uses paired normalized probabilities rather than a raw home midpoint', () => {
 const result = quoteHistory([book('home', 0.6), book('away', 0.45)])
 assert.ok(Math.abs(result.series[0]!.v - 0.6 / 1.05) < 1e-9)
})
test('requested source never joins another exchange history to the live endpoint', () => {
 const later = new Date(at.getTime() + 10000)
 const rows = [book('home', 0.9), book('away', 0.1), book('home', 0.3, { source: 'polymarket', fetchedTs: later, sourceTs: later }), book('away', 0.7, { source: 'polymarket', fetchedTs: later, sourceTs: later })]
 assert.equal(quoteHistory(rows).source, 'polymarket')
 assert.equal(quoteHistory(rows, 'kalshi').series[0]!.v, 0.9)
 assert.equal(quoteHistory(rows, 'espn').series.length, 0)
})
test('bad, stale, crossed, and three-way books do not become a two-team history', () => {
 assert.deepEqual(quoteHistory([book('home', 0.6, { sourceTs: new Date(at.getTime() - 60000) }), book('away', 0.4, { sourceTs: new Date(at.getTime() - 60000) })]).series, [])
 assert.deepEqual(quoteHistory([book('home', 0.6, { bid: 0.7, ask: 0.5 }), book('away', 0.4, { bid: 0.5, ask: 0.3 })]).series, [])
 assert.deepEqual(quoteHistory([book('home', 0.4), book('away', 0.3), book('draw', 0.3)]).series, [])
})
test('a real large move in valid quotes stays in the history', () => {
 const later = new Date(at.getTime() + 10000)
 const rows = [book('home', 0.1), book('away', 0.9), book('home', 0.9, { fetchedTs: later, sourceTs: later }), book('away', 0.1, { fetchedTs: later, sourceTs: later })]
 assert.deepEqual(quoteHistory(rows).series.map(x => x.v), [0.1, 0.9])
})


test('raw database timestamps are normalized from strings as well as Date objects', () => {
 const rows = [book('home', 0.6), book('away', 0.4)].map(q => ({ ...q, fetchedTs: at.toISOString(), sourceTs: at.toISOString() }))
 assert.deepEqual(quoteHistory(rows).series, [{ t: at.getTime(), v: 0.6 }])
})
