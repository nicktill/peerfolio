import assert from 'node:assert/strict'
import { test } from 'node:test'
import { pickPositions } from './pick-positions.ts'
const fill = (id: string, stake = 100, totalReturn = 620) => ({ id, stake, totalReturn, price: 520, selection: 'away', point: null, status: 'open', event: { id: 'game' }, market: { kind: 'moneyline', player: null, statKey: null } })
test('repeated open picks share a position while every fill and its payout stays intact', () => {
  const picks = [fill('a', 500, 3025), fill('b', 100, 620)]
  const rows = pickPositions(picks)
  assert.equal(rows.length, 1)
  assert.equal(rows[0]!.pick.stake, 600)
  assert.equal(rows[0]!.pick.totalReturn, 3645)
  assert.deepEqual(rows[0]!.fills, picks)
  assert.equal(picks[0]!.stake, 500)
})
test('different events, outcomes, lines, players and settled results never combine', () => {
  const a = fill('a')
  for (const b of [{ ...fill('b'), event: { id: 'other' } }, { ...fill('b'), selection: 'home' }, { ...fill('b'), point: 2 }, { ...fill('b'), market: { ...a.market, player: 'other' } }, { ...fill('b'), status: 'won' }]) assert.equal(pickPositions([a, b]).length, 2)
})
