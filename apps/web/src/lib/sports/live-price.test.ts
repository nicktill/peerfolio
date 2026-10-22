import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptsLivePrice } from './live-price.ts'

test('minor ticks are accepted in both directions, with bounded payout loss', () => {
  assert.equal(acceptsLivePrice(505, 500), true)
  assert.equal(acceptsLivePrice(505, 510), true)
  assert.equal(acceptsLivePrice(505, 470), false)
  assert.equal(acceptsLivePrice(-150, -155), true)
  assert.equal(acceptsLivePrice(505, 1000), false)
  for (const bad of [0, NaN, Infinity, 50, 100.5]) assert.equal(acceptsLivePrice(bad, 505), false)
})
