import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseDelimited, parseHoldingsText, parseLines, toNumber } from "./import-parse.ts"

describe("toNumber", () => {
  it("reads money and quantities as written by brokers", () => {
    assert.equal(toNumber("$1,234.50"), 1234.5)
    assert.equal(toNumber(" 22.056 "), 22.056)
    assert.equal(toNumber("(12.5)"), -12.5)
    assert.equal(toNumber("--"), null)
    assert.equal(toNumber("abc"), null)
  })
})

describe("parseDelimited", () => {
  it("reads a Fidelity-style export, skipping the money-market core and the disclaimer", () => {
    const csv = [
      "Account Number,Account Name,Symbol,Description,Quantity,Last Price,Current Value,Cost Basis Total,Average Cost Basis",
      'X123,Individual,AAPL,APPLE INC,12.045,$330.47,"$3,980.53","$2,303.30",$191.22',
      "X123,Individual,SPAXX**,HELD IN MONEY MARKET,6634.91,$1.00,$6634.91,,",
      'X123,Individual,VOO,VANGUARD S&P 500 ETF,37.084,$704.10,"$26,111.12","$24,151.00",$651.26',
      '"The data and information in this spreadsheet is provided to you solely for your use"',
    ].join("\n")
    const out = parseDelimited(csv)
    assert.ok(out)
    assert.deepEqual(out.rows.map((r) => [r.symbol, r.quantity, r.avgCost]), [["AAPL", 12.045, 191.22], ["VOO", 37.084, 651.26]])
    assert.equal(out.rows[0]!.name, "APPLE INC")
    assert.equal(out.warnings.length, 1)
  })

  it("finds the header below preamble lines and derives average cost from total cost", () => {
    const tsv = ["Positions for account", "", "Symbol\tShares\tCost Basis", "MSFT\t8.04\t$2,915.00", "NVDA\t22.056\t$1,622.00"].join("\n")
    const out = parseDelimited(tsv)
    assert.ok(out)
    assert.equal(out.rows.length, 2)
    assert.ok(Math.abs(out.rows[0]!.avgCost! - 2915 / 8.04) < 1e-9)
  })

  it("adds up the same ticker held in two lots", () => {
    const out = parseDelimited("Symbol,Quantity,Average Cost\nAAPL,10,100\nAAPL,10,200")
    assert.ok(out)
    assert.equal(out.rows.length, 1)
    assert.equal(out.rows[0]!.quantity, 20)
    assert.equal(out.rows[0]!.avgCost, 150)
  })

  it("returns null when there is no header to trust", () => {
    assert.equal(parseDelimited("just,some,words\nand,more,words"), null)
  })
})

describe("parseLines", () => {
  it("reads the common shorthand", () => {
    const out = parseLines("AAPL 10\nmsft 5 @ 310.25\nBRK.B, 2.5, 410\nVTI 3 sh @ $220")
    assert.ok(out)
    assert.deepEqual(out.rows.map((r) => [r.symbol, r.quantity, r.avgCost]), [["AAPL", 10, null], ["MSFT", 5, 310.25], ["BRK.B", 2.5, 410], ["VTI", 3, 220]])
  })

  it("won't mistake prose or a vertical broker dump for a list", () => {
    assert.equal(parseLines("Total portfolio value\n$154,180.32\nStocks\nName\nSymbol\nShares"), null)
  })
})

describe("parseHoldingsText", () => {
  it("prefers a table, falls back to lines, and gives up on anything else", () => {
    assert.equal(parseHoldingsText("Symbol,Quantity\nAAPL,3")!.rows[0]!.symbol, "AAPL")
    assert.equal(parseHoldingsText("AAPL 3")!.rows[0]!.quantity, 3)
    assert.equal(parseHoldingsText("Robinhood Markets\nHOOD\n100\n$117.55"), null)
  })
})
