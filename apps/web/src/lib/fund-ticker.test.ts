import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { failedMetadataUpdate, isFundTicker, isProviderChecked, unconfirmedFund } from "./fund-ticker.ts"

describe("isFundTicker", () => {
  it("trusts a stored mutual_fund type first", () => {
    assert.equal(isFundTicker({ marketTicker: "AAPL", type: "mutual_fund" }), true)
  })

  it("recognizes five-letter tickers ending in X", () => {
    for (const t of ["FSPSX", "FSPHX", "FSPGX", "FSPTX", "VWUAX"]) assert.equal(isFundTicker({ marketTicker: t }), true, t)
    assert.equal(isFundTicker({ marketTicker: "FSPSX", type: null }), true)
    assert.equal(isFundTicker({ marketTicker: "FSPSX", type: "equity" }), true) // the insert default is not evidence
  })

  it("does not call stocks, ETFs, crypto or other shapes funds", () => {
    for (const t of ["AAPL", "BRK.B", "X:BTCUSD", "ABCX", "ABCDEX", "ABCD1", "F"]) assert.equal(isFundTicker({ marketTicker: t }), false, t)
    assert.equal(isFundTicker({ marketTicker: "FSPSX", type: "etf" }), false)
    assert.equal(isFundTicker({ marketTicker: "FSPSX", type: "equity", providerChecked: true }), false)
    assert.equal(isFundTicker({ marketTicker: null }), false)
  })
})

describe("metadata confirmation", () => {
  const row = { type: "equity", name: "Fidelity Select Software", metadataCheckedAt: null as Date | null }
  it("a named fund typed equity whose details lookup returned nothing is still routed as a fund", () => {
    assert.equal(unconfirmedFund("FSPSX", row, null), true) // enrichment types it a fund and records no confirmation
    assert.equal(isFundTicker({ marketTicker: "FSPSX", type: "mutual_fund", providerChecked: isProviderChecked(row) }), true)
    // even if a row somehow kept 'equity' with a name and no timestamp
    assert.equal(isFundTicker({ marketTicker: "FSPSX", type: "equity", providerChecked: isProviderChecked(row) }), true)
  })
  it("a real equity ending in X that the provider confirmed is not a fund", () => {
    assert.equal(unconfirmedFund("ABCDX", row, "equity"), false)
    const confirmed = { ...row, metadataCheckedAt: new Date() }
    assert.equal(isProviderChecked(confirmed), true)
    assert.equal(isFundTicker({ marketTicker: "ABCDX", type: "equity", providerChecked: isProviderChecked(confirmed) }), false)
  })
  it("never demotes a row an earlier lookup confirmed, or a ticker that isn't fund-shaped", () => {
    assert.equal(unconfirmedFund("ABCDX", { ...row, metadataCheckedAt: new Date() }, null), false)
    assert.equal(unconfirmedFund("AAPL", row, null), false)
  })
})

describe("failed metadata writes", () => {
  const now = Date.parse("2026-10-14T23:00:00Z")
  it("a named unconfirmed fund stays routed to Tiingo after an exception", () => {
    const row = { type: "equity", name: "Fidelity", metadataCheckedAt: null }
    const saved = { ...row, ...failedMetadataUpdate("FSPSX", row, now) }
    assert.equal(saved.metadataCheckedAt, null)
    assert.equal(saved.type, "mutual_fund")
    assert.equal(isProviderChecked(saved), false)
    assert.equal(isFundTicker({ marketTicker: "FSPSX", ...saved, providerChecked: isProviderChecked(saved) }), true)
  })
  it("preserves confirmed equities and the existing retry delay for ordinary stocks", () => {
    for (const [ticker, row] of [
      ["ABCDX", { type: "equity", name: "Confirmed equity", metadataCheckedAt: new Date(now - 8 * 86_400_000) }],
      ["AAPL", { type: "equity", name: "Apple", metadataCheckedAt: null }],
    ] as const) {
      const patch = failedMetadataUpdate(ticker, row, now)
      assert.equal(patch.type, undefined)
      assert.equal(patch.metadataCheckedAt?.getTime(), now - 6 * 86_400_000)
    }
  })
})
