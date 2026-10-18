import test from 'node:test'
import assert from 'node:assert/strict'
import { formatGameStatus, mergeLiveState, type StatusInput } from './game-status.ts'

const T0 = Date.parse('2026-10-18T20:00:00Z')
const base = (o: Partial<StatusInput>): StatusInput => ({ sport: 'nfl', status: 'live', startsAt: '2026-10-18T17:00:00Z', asOf: T0, ...o })
const f = (o: Partial<StatusInput>, ageMs = 0) => formatGameStatus(base(o), T0 + ageMs, 'UTC')

test('football and basketball show period and last reported clock', () => {
  assert.equal(f({ period: 3, clock: '7:59' }).text, 'Q3 7:59')
  assert.equal(f({ sport: 'nba', period: 4, clock: '2:31' }).text, 'Q4 2:31')
  assert.equal(f({ sport: 'cfb', period: 5, clock: '10:00' }).text, 'OT 10:00')
  assert.equal(f({ sport: 'nba', period: 6, clock: '3:00' }).text, '2OT 3:00')
})
test('hockey periods and overtime', () => {
  assert.equal(f({ sport: 'nhl', period: 2, clock: '13:21' }).text, 'P2 13:21')
  assert.equal(f({ sport: 'nhl', period: 4, clock: '4:12' }).text, 'OT 4:12')
  assert.equal(f({ sport: 'nhl', period: 1, statusName: 'STATUS_END_PERIOD', clock: '0:00' }).text, 'End P1')
})
test('stop-start clocks never tick; they dim after 30s', () => {
  assert.equal(f({ period: 3, clock: '7:59' }, 10_000).dim, false)
  const s = f({ period: 3, clock: '7:59' }, 40_000)
  assert.equal(s.text, 'Q3 7:59'); assert.equal(s.dim, true)
})
test('stale feed drops the clock', () => {
  assert.equal(f({ period: 3, clock: '7:59' }, 130_000).text, 'Live · Q3')
  assert.equal(f({ sport: 'mls', clock: "72'" }, 130_000).text, 'Delayed')
})
test('junk clocks are dropped', () => {
  assert.equal(f({ period: 2, clock: 'abc' }).text, 'Q2')
  assert.equal(f({ period: 2, clock: '0:00' }).text, 'Q2')
})
test('halftime', () => {
  assert.equal(f({ period: 2, statusName: 'STATUS_HALFTIME' }).text, 'Half')
  assert.equal(f({ sport: 'mls', statusName: 'STATUS_HALFTIME' }).text, 'HT')
})
test('baseball innings', () => {
  assert.equal(f({ sport: 'mlb', detail: 'Top 7th' }).text, 'Top 7th')
  assert.equal(f({ sport: 'mlb', detail: 'Bot 3rd' }).text, 'Bot 3rd')
  assert.equal(f({ sport: 'mlb', detail: 'Mid 5th' }).tone, 'break')
  assert.equal(f({ sport: 'mlb', detail: 'weird' }).text, 'Live')
})
test('soccer: minutes, stoppage, ticking only with seconds and fresh', () => {
  assert.equal(f({ sport: 'mls', clock: "72'" }).text, "72'")
  assert.equal(f({ sport: 'mls', clock: "72'" }, 40_000).text, "72'")
  assert.equal(f({ sport: 'mls', clock: "90'+3'" }).text, "90+3'")
  assert.equal(f({ sport: 'mls', clock: '72:50' }, 20_000).text, "73'")
  assert.equal(f({ sport: 'mls', clock: '72:50' }, 60_000).text, "72'")
})
test('tennis set number and scores', () => {
  const s = f({ sport: 'tennis', homeSets: [{ games: 6 }, { games: 3 }], awaySets: [{ games: 4 }, { games: 2 }] })
  assert.equal(s.text, 'Set 2'); assert.equal(s.extra, '6-4 3-2')
  assert.equal(f({ sport: 'tennis' }).text, 'Live')
})
test('final, postponed, canceled, delayed', () => {
  assert.equal(f({ status: 'final' }).text, 'Final')
  assert.equal(f({ status: 'final', statusName: 'STATUS_FINAL_OT' }).text, 'Final/OT')
  assert.equal(f({ status: 'unavailable', statusName: 'STATUS_POSTPONED' }).text, 'Postponed')
  assert.equal(f({ status: 'unavailable', statusName: 'STATUS_CANCELED' }).text, 'Canceled')
  assert.equal(f({ status: 'unavailable', statusName: 'STATUS_DELAYED' }).text, 'Delayed')
  assert.equal(f({ statusName: 'STATUS_RAIN_DELAY', sport: 'mlb' }).text, 'Delayed')
})
test('upcoming shows start time in the given zone', () => {
  const s = formatGameStatus(base({ status: 'upcoming', startsAt: '2026-10-18T23:30:00Z' }), T0, 'UTC')
  assert.match(s.text, /^Starts 11:30\s?PM$/)
  assert.match(formatGameStatus(base({ status: 'upcoming', startsAt: '2026-10-20T23:30:00Z' }), T0, 'UTC').text, /^Tue 11:30\s?PM$/)
})
test('live worker state overlays only when newer and parseable', () => {
  const i = base({ period: 2, clock: '5:00' })
  const m = mergeLiveState(i, { period: 'Q3', clock: '07:59', stateAsOf: new Date(T0 + 5000).toISOString() })
  assert.equal(formatGameStatus(m, T0 + 5000, 'UTC').text, 'Q3 7:59')
  assert.equal(mergeLiveState(i, { period: 'Q3', clock: '07:59', stateAsOf: new Date(T0 - 5000).toISOString() }), i)
  assert.equal(mergeLiveState(i, { period: 'End P1', clock: null, stateAsOf: new Date(T0 + 5000).toISOString() }), i)
})
