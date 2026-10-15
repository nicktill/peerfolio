import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { cashLabel, isCashTicker } from "./cash-ticker.ts"

describe("cash tickers", () => {
  it("recognises Plaid's currency tickers", () => {
    assert.equal(isCashTicker("CUR:USD"), true)
    assert.equal(isCashTicker("cur:cad"), true)
    assert.equal(isCashTicker("CURRENT"), false)
    assert.equal(isCashTicker("AAPL"), false)
    assert.equal(isCashTicker(null), false)
  })
  it("labels cash by currency", () => {
    assert.deepEqual(cashLabel("CUR:USD"), { title: "Cash", subtitle: "US dollars" })
    assert.deepEqual(cashLabel("CUR:cad"), { title: "Cash", subtitle: "CAD" })
  })
})
