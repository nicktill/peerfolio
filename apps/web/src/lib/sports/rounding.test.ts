import assert from "node:assert/strict"
import { test } from "node:test"
import { americanToDecimal, totalReturn } from "./odds.ts"
import { winOn100 } from "./format.ts"
import { parlayQuote } from "./parlay-math.ts"
import { parlayReturn } from "./parlay.ts"

const exact = (stake: number, price: number) => (price > 0 ? Math.floor((stake * (100 + price)) / 100) : Math.floor((stake * (100 - price)) / -price))

test("a single pick's return is the exact floored product, never one credit low", () => {
  assert.equal(totalReturn(486, -1944), 511)
  for (let price = -2000; price <= 3000; price++) {
    if (Math.abs(price) < 100) continue
    for (let stake = 1; stake <= 300; stake++) assert.equal(totalReturn(stake, price), exact(stake, price), `${stake} at ${price}`)
  }
})

test("single, parlay and slip preview round the same way", () => {
  for (const price of [-110, -125, -150, -1944, 120, 250, 1000]) {
    for (const stake of [10, 15, 20, 45, 486]) {
      assert.equal(parlayReturn(stake, americanToDecimal(price)), totalReturn(stake, price))
      assert.equal(parlayQuote([price], stake)!.totalReturn, totalReturn(stake, price))
    }
  }
})


test("extreme live odds display reflects whole-credit settlement", () => {
  assert.equal(totalReturn(100, -39900), 100)
  assert.equal(winOn100(-39900), 0)
  assert.equal(totalReturn(100, 13230), 13330)
  assert.equal(winOn100(13230), 13230)
})
