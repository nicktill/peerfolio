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

describe("several accounts in one file", () => {
  const csv = [
    "Account Number,Account Name,Symbol,Description,Quantity,Average Cost Basis",
    "X111,Individual,AAPL,APPLE INC,10,$190.00",
    "X111,Individual,VOO,VANGUARD S&P 500,5,$600.00",
    "X222,ROTH IRA,VOO,VANGUARD S&P 500,20,$450.00",
    "X333,401(k) Plan,FXAIX,FIDELITY 500 INDEX,100,$120.00",
    "X111,Individual,VOO,VANGUARD S&P 500,1,$700.00",
  ].join("\n")

  it("keeps the same ticker in two accounts as two positions, labelled by account", () => {
    const out = parseDelimited(csv)
    assert.ok(out)
    const voo = out.rows.filter((r) => r.symbol === "VOO")
    assert.deepEqual(voo.map((r) => [r.account, r.quantity]).sort(), [["Individual", 6], ["ROTH IRA", 20]])
    assert.deepEqual([...new Set(out.rows.map((r) => r.account))].sort(), ["401(k) Plan", "Individual", "ROTH IRA"])
  })

  it("adds up lots within one account, weighting the average cost", () => {
    const out = parseDelimited(csv)!
    const voo = out.rows.find((r) => r.symbol === "VOO" && r.account === "Individual")!
    assert.equal(voo.quantity, 6)
    assert.ok(Math.abs(voo.avgCost! - (5 * 600 + 1 * 700) / 6) < 1e-9)
  })

  it("falls back to the account number when there is no name column", () => {
    const out = parseDelimited("Account Number,Symbol,Quantity\nX111,AAPL,1\nX222,AAPL,2")!
    assert.deepEqual(out.rows.map((r) => r.account), ["X111", "X222"])
  })

  it("leaves account empty for a single-account file", () => {
    assert.equal(parseDelimited("Symbol,Quantity\nAAPL,3")!.rows[0]!.account, null)
  })
})

describe("prices in the file", () => {
  it("reads the last price, or works it out from the value, for tickers no market source covers", () => {
    const out = parseDelimited(
      [
        "Symbol,Description,Quantity,Last Price,Current Value,Average Cost Basis",
        'FXAIX,FIDELITY 500 INDEX,12.3,$200.00,"$2,460.00",$146.34',
        'FZROX,FIDELITY ZERO TOTAL,50,,"$1,000.00",$16.00',
        "AAPL,APPLE INC,10,$329.40,,$190.00",
      ].join("\n"),
    )!
    assert.deepEqual(out.rows.map((r) => [r.symbol, r.price]), [["FXAIX", 200], ["FZROX", 20], ["AAPL", 329.4]])
  })

  it("has no price when the file doesn't show one", () => {
    assert.equal(parseDelimited("Symbol,Quantity\nAAPL,3")!.rows[0]!.price, null)
    assert.equal(parseLines("AAPL 3 @ 150")!.rows[0]!.price, null)
  })
})
