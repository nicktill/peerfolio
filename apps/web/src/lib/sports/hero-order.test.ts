import test from 'node:test'
import assert from 'node:assert/strict'
import { pickHeroGames } from './hero-order.ts'
import type { ScoreGame } from './scoreboard.ts'
const g = (id: string, sport: string, status: ScoreGame['status'], startsAt = '2026-10-17T20:00:00Z'): ScoreGame =>
  ({ id, sport, home: 'H', away: 'A', startsAt, homeRecord: null, awayRecord: null, status, homeScore: null, awayScore: null, detail: '', fetchedAt: startsAt })
const now = Date.parse('2026-10-17T12:00:00Z')
test('live first, popular leagues before others, tennis last', () => {
  const out = pickHeroGames([g('t', 'tennis', 'live'), g('m', 'mls', 'live'), g('n', 'nba', 'final'), g('f', 'nfl', 'live'), g('h', 'nhl', 'live')], now)
  assert.deepEqual(out.map(x => x.id), ['f', 'h', 'm'])
})
test('NFL/NBA before NHL within the same bucket; tennis only when nothing else', () => {
  assert.deepEqual(pickHeroGames([g('h', 'nhl', 'upcoming'), g('b', 'nba', 'upcoming'), g('t', 'tennis', 'live')], now).map(x => x.id), ['b', 'h', 't'])
  assert.deepEqual(pickHeroGames([g('t', 'tennis', 'upcoming')], now).map(x => x.id), ['t'])
})
test('drops past upcoming and unavailable games; limit of three', () => {
  const out = pickHeroGames([g('p', 'nfl', 'upcoming', '2026-10-17T08:00:00Z'), g('u', 'nfl', 'unavailable'), ...['a', 'b', 'c', 'd'].map(i => g(i, 'nba', 'live'))], now)
  assert.equal(out.length, 3)
  assert.ok(!out.some(x => x.id === 'p' || x.id === 'u'))
})
