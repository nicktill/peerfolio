import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { classifyPosition, mapIndustryToSector } from "./sectors.ts"

describe("mapIndustryToSector", () => {
  const cases: [string, string][] = [
    ["Technology", "Technology"],
    ["Semiconductors", "Technology"],
    ["Communications Equipment", "Technology"],
    ["Banking", "Financials"],
    ["Insurance", "Financials"],
    ["Pharmaceuticals", "Health Care"],
    ["Biotechnology", "Health Care"],
    ["Health Care Providers & Services", "Health Care"],
    ["Media", "Communication Services"],
    ["Telecommunication", "Communication Services"],
    ["Communications", "Communication Services"],
    ["Retail", "Consumer Discretionary"],
    ["Automobiles", "Consumer Discretionary"],
    ["Beverages", "Consumer Staples"],
    ["Food Products", "Consumer Staples"],
    ["Aerospace & Defense", "Industrials"],
    ["Machinery", "Industrials"],
    ["Oil & Gas", "Energy"],
    ["Gas Utilities", "Utilities"],
    ["Utilities", "Utilities"],
    ["Real Estate", "Real Estate"],
    ["Chemicals", "Materials"],
    ["Metals & Mining", "Materials"],
  ]
  for (const [input, expected] of cases) it(`${input} -> ${expected}`, () => assert.equal(mapIndustryToSector(input), expected))

  it("leaves unrecognised industries as Other rather than guessing", () => {
    assert.equal(mapIndustryToSector("Consumer products"), "Other")
    assert.equal(mapIndustryToSector("N/A"), "Other")
  })

  it("is case and whitespace tolerant, and null without a string", () => {
    assert.equal(mapIndustryToSector("  BANKING "), "Financials")
    assert.equal(mapIndustryToSector(""), null)
    assert.equal(mapIndustryToSector(null), null)
    assert.equal(mapIndustryToSector(undefined), null)
  })
})

describe("classifyPosition", () => {
  it("puts funds, crypto and cash in their own buckets, whatever sector is stored", () => {
    assert.deepEqual(classifyPosition("etf", "Technology"), { kind: "bucket", name: "Funds & ETFs" })
    assert.deepEqual(classifyPosition("mutual_fund", null), { kind: "bucket", name: "Funds & ETFs" })
    assert.deepEqual(classifyPosition("cryptocurrency", null), { kind: "bucket", name: "Crypto" })
    assert.deepEqual(classifyPosition("fixed_income", null), { kind: "bucket", name: "Cash & bonds" })
    assert.deepEqual(classifyPosition("cash", null), { kind: "bucket", name: "Cash & bonds" })
  })

  it("uses the sector for stocks, and marks a stock without one unclassified", () => {
    assert.deepEqual(classifyPosition("equity", "Energy"), { kind: "sector", name: "Energy" })
    assert.equal(classifyPosition("equity", null).kind, "unclassified")
    assert.equal(classifyPosition(null, null).kind, "unclassified")
  })
})
