import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parqetSymbol, tickerLogoSrc } from "./ticker-logo.ts"

describe("tickerLogoSrc", () => {
  it("asks Parqet with a hyphen for a share class, however the brokerage wrote it", () => {
    for (const s of ["BRK.B", "brk-b", "BRK/B", " BRK.B "]) assert.equal(parqetSymbol(s), "BRK-B")
    assert.equal(tickerLogoSrc("AAPL"), "/api/market/logo/AAPL")
  })

  it("has no URL for something that can't be a ticker", () => {
    for (const s of ["", "1ABC", "TOOLONGX", "A.BCD", "AB C", "X:BTCUSD"]) assert.equal(tickerLogoSrc(s), null)
  })
})
