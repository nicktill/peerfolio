import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseHoldingsText, parseVertical } from "./import-parse.ts"

// Pasted from Robinhood's web account page: one value per line.
const ROBINHOOD = `Stocks & options
94.82%
$151,732.53
Individual cash
5.18%
$8,286.74
Individual cash$8,286.745.18%
Stocks
Name
Symbol
Shares
Price
Average cost
Total return
Equity
AMD
AMD
22.5
$612.34
$140.63
$10,613.47
$13,777.65
Palantir Technologies
PLTR
60
$208.59
$35.48
$10,386.86
$12,515.40
Robinhood Markets
HOOD
100
$111.17
$35.11
$7,605.93
$11,117.00
NVIDIA
NVDA
22.056
$229.68
$73.56
$3,443.39
$5,065.76
Taiwan Semiconductor Manufacturing
TSM
10.098
$448.06
$150.38
$3,005.86
$4,524.34
Datadog
DDOG
15
$284.57
$107.49
$2,656.15
$4,268.55
Vanguard S&P 500 ETF
VOO
39.148
$716.25
$654.40
$2,421.43
$28,040.06
Amazon
AMZN
25
$258.96
$166.24
$2,318.11
$6,474.00
Palo Alto Networks
PANW
11
$397.20
$194.96
$2,224.59
$4,369.20
ASML Holding NV
ASML
3
$1,717.24
$1,017.44
$2,099.40
$5,151.72
Tesla
TSLA
11
$376.34
$186.06
$2,093.06
$4,139.74
Meta Platforms
META
6.018
$766.54
$424.14
$2,060.52
$4,612.95
Apple
AAPL
12.045
$341.28
$191.22
$1,807.47
$4,110.74
Microsoft
MSFT
8.04
$543.21
$362.64
$1,451.89
$4,367.64
Alphabet Class A
GOOGL
10.021
$355.62
$213.14
$1,427.82
$3,563.77
Invesco QQQ
QQQ
8.053
$745.55
$572.00
$1,397.62
$6,004.06
Rocket Lab Corporation
RKLB
25
$64.72
$10.85
$1,346.75
$1,618.00
Reddit
RDDT
15
$156.01
$99.89
$841.76
$2,340.15
Marvell Technology
MRVL
15.004
$271.07
$222.68
$726.03
$4,067.18
Eli Lilly
LLY
3.506
$1,167.19
$1,027.97
$488.10
$4,092.23
Toast
TOST
60
$30.80
$23.63
$430.30
$1,848.00
Costco
COST
2.53
$953.40
$816.24
$347.04
$2,412.34
State Street
STT
15.126
$174.82
$154.95
$300.55
$2,644.39
Broadcom
AVGO
3.022
$358.76
$324.89
$102.37
$1,084.35
Uber
UBER
25
$71.21
$70.20
$25.30
$1,780.25
Interactive Brokers
IBKR
20.019
$87.78
$87.68
$1.93
$1,757.27
State Street Health Care Select Sector SPDR ETF
XLV
10.038
$169.67
$173.08
$34.24
$1,703.08
Invesco S&P 500 Equal Weight ETF
RSP
20.076
$213.31
$218.73
$108.88
$4,282.34`

describe("Robinhood vertical paste", () => {
  const out = parseHoldingsText(ROBINHOOD)!

  it("reads all 28 stocks and skips the account summary above the table", () => {
    assert.ok(out)
    assert.equal(out.rows.length, 28)
    const by = Object.fromEntries(out.rows.map((r) => [r.symbol, r]))
    assert.equal(by.AMD!.quantity, 22.5)
    assert.equal(by.AMD!.avgCost, 140.63)
    assert.equal(by.PLTR!.quantity, 60)
    assert.equal(by.VOO!.quantity, 39.148)
    assert.equal(by.ASML!.avgCost, 1017.44)
    assert.equal(by.XLV!.name, "State Street Health Care Select Sector SPDR ETF")
  })

  it("finds nothing wrong with numbers that agree", () => {
    assert.deepEqual(out.rows.filter((r) => r.flag).map((r) => r.symbol), [])
    assert.deepEqual(out.warnings, [])
  })

  it("flags a row whose shares × price disagrees with the value", () => {
    const bad = parseVertical(ROBINHOOD.replace("$12,515.40", "$1,251.54"))!
    assert.deepEqual(bad.rows.filter((r) => r.flag).map((r) => r.symbol), ["PLTR"])
    assert.equal(bad.warnings.length, 1)
  })

  it("survives a stray section title between holdings", () => {
    const out2 = parseVertical(ROBINHOOD.replace("Tesla\nTSLA", "Options\nTesla\nTSLA"))!
    assert.equal(out2.rows.length, 28)
  })

  it("works when the table has no name column", () => {
    const out3 = parseVertical("Symbol\nShares\nPrice\nEquity\nAAPL\n10\n$200.00\n$2,000.00\nMSFT\n2\n$400.00\n$800.00")!
    assert.deepEqual(out3.rows.map((r) => [r.symbol, r.quantity, r.price]), [["AAPL", 10, 200], ["MSFT", 2, 400]])
  })
})

describe("other brokerage layouts", () => {
  it("Schwab tab-separated copy with a cash row and account total", () => {
    const t = [
      "Symbol\tDescription\tQuantity\tPrice\tPrice Change %\tMarket Value\tCost Basis\tGain/Loss $",
      "AAPL\tAPPLE INC\t12.045\t$341.28\t+0.5%\t$4,110.74\t$2,303.30\t$1,807.44",
      "SCHD\tSCHWAB US DIVIDEND EQUITY ETF\t100\t$28.10\t-0.2%\t$2,810.00\t$2,400.00\t$410.00",
      "Cash & Cash Investments\t--\t--\t--\t--\t$1,000.00\t--\t--",
      "Account Total\t\t\t\t\t$7,920.74\t\t",
    ].join("\n")
    const out = parseHoldingsText(t)!
    assert.deepEqual(out.rows.map((r) => r.symbol), ["AAPL", "SCHD"])
    assert.equal(out.rows[1]!.avgCost, 24)
    assert.equal(out.rows[1]!.flag, null)
  })

  it("Webull-style CSV with quoted money and a differently named cost column", () => {
    const t = 'Ticker,Name,Shares,Avg Cost,Last,Market Value\nTSLA,"Tesla, Inc.",11,$186.06,$376.34,"$4,139.74"\nNVDA,NVIDIA,22.056,$73.56,$229.68,"$5,065.76"'
    const out = parseHoldingsText(t)!
    assert.deepEqual(out.rows.map((r) => [r.symbol, r.quantity, r.avgCost]), [["TSLA", 11, 186.06], ["NVDA", 22.056, 73.56]])
    assert.equal(out.rows[0]!.name, "Tesla, Inc.")
  })

  it("space-aligned columns copied from a web table", () => {
    const t = ["Symbol   Shares   Price   Avg Cost", "VTI      25       $290.10  $210.50", "BND      40       $72.50   $75.00"].join("\n")
    const out = parseHoldingsText(t)!
    assert.deepEqual(out.rows.map((r) => [r.symbol, r.quantity, r.avgCost]), [["VTI", 25, 210.5], ["BND", 40, 75]])
  })

  it("headerless single-line rows, resolving columns by shares × price = value", () => {
    const t = ["NVDA NVIDIA 22.056 $229.68 $73.56 $5,065.76", "AAPL Apple 12.045 $341.28 $191.22 $4,110.74", "MSFT Microsoft 8.04 $543.21 $362.64 $4,367.64"].join("\n")
    const out = parseHoldingsText(t)!
    assert.deepEqual(out.rows.map((r) => [r.symbol, r.quantity, r.price, r.avgCost]), [["NVDA", 22.056, 229.68, 73.56], ["AAPL", 12.045, 341.28, 191.22], ["MSFT", 8.04, 543.21, 362.64]])
  })

  it("flags a row whose price and value contradict the shares", () => {
    const out = parseHoldingsText("Symbol,Quantity,Price,Market Value\nAAPL,10,$200,$2000\nMSFT,10,$400,$900")!
    assert.deepEqual(out.rows.map((r) => !!r.flag), [false, true])
  })

  it("negative and fractional values don't produce phantom holdings", () => {
    const out = parseHoldingsText("Symbol,Quantity,Average Cost\nAAPL,-5,100\nBTC,0.0042,30000")!
    assert.deepEqual(out.rows.map((r) => r.symbol), ["BTC"])
  })
})
