import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { portfolioBrief } from "./portfolio-brief.ts"

const pos = (securityId: string, ticker: string, quantity: number, price: number, previousClose: number | null) => ({
  securityId, ticker, name: ticker, type: "equity", quantity, value: quantity * price, costBasis: null, price, previousClose, priceAsOf: "2026-10-15",
})

describe("portfolioBrief", () => {
  it("summarizes value, today's move and the largest holdings", () => {
    const text = portfolioBrief([pos("a", "NVDA", 10, 100, 90), pos("b", "AAPL", 5, 100, 100)])
    assert.match(text, /\$1,500 across 2 holdings/)
    assert.match(text, /Today so far: \+\$100/)
    assert.match(text, /NVDA 66\.7% \(\+11\.11% today\)/)
  })
  it("says so when there is nothing priced", () => {
    assert.match(portfolioBrief([]), /no priced holdings/)
  })
})
