import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { REAL_FIXTURES, type RealFixture } from "./import-corpus-real.ts"
import { parseHoldingsText, splitLine } from "./import-parse.ts"

const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 5e-4 * Math.max(1, Math.abs(b)))

function check(f: RealFixture, text: string, { accounts }: { accounts: boolean }) {
  const out = parseHoldingsText(text)
  if (f.via !== "table") return assert.equal(out, null, "must hand off rather than guess")
  assert.ok(out, "the local reader should read this")
  assert.equal(out.rows.length, f.expect.length, `rows: ${out.rows.map((r) => `${r.symbol}[${r.account}]`).join(",")}`)
  f.expect.forEach(([symbol, quantity, avg, account], i) => {
    const r = out.rows[i]!
    assert.equal(r.symbol, symbol)
    assert.ok(near(r.quantity, quantity), `${symbol} quantity ${r.quantity} vs ${quantity}`)
    assert.ok(near(r.avgCost, avg), `${symbol} avg ${r.avgCost} vs ${avg}`)
    if (accounts) assert.equal(r.account, account, `${symbol} account`)
  })
  assert.deepEqual(out.rows.filter((r) => r.flag).map((r) => r.symbol), [], "numbers should agree")
}

/** What a browser gives you when you select a table and copy: tab-separated, no quotes. */
function copied(csv: string) {
  const delimiter = ","
  return csv
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .map((l) => (l.includes(",") ? splitLine(l, delimiter).join("\t").replace(/\t+$/, "") : l))
    .join("\n")
}

describe("real-structure exports", () => {
  for (const f of REAL_FIXTURES) it(`${f.inst}: ${f.name}`, () => check(f, f.text, { accounts: true }))
})

describe("the same files copied from the screen", () => {
  for (const f of REAL_FIXTURES.filter((x) => x.via === "table" && !x.text.startsWith("Statement,"))) it(`${f.inst}: ${f.name}`, () => check(f, copied(f.text), { accounts: false }))
})

/** One field per line, as some pages copy: every header label, then every cell of every row. */
function vertical(csv: string) {
  return csv
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .filter((l) => l.includes(","))
    .flatMap((l) => splitLine(l, ","))
    .filter((c) => c !== "")
    .join("\n")
}

describe("the same files copied one field per line", () => {
  const names = ["Merrill Edge", "Moomoo"]
  for (const f of REAL_FIXTURES.filter((x) => names.includes(x.inst))) it(`${f.inst}: ${f.name}`, () => check(f, vertical(f.text), { accounts: false }))
})

describe("Robinhood rows with collapsed whitespace (one holding per line)", () => {
  const lines = [
    "AMD AMD 22.5 $612.34 $140.63 $10,613.47 $13,777.65",
    "Palantir Technologies PLTR 60 $208.59 $35.48 $10,386.86 $12,515.40",
    "State Street Health Care Select Sector SPDR ETF XLV 10.038 $169.67 $173.08 $34.24 $1,703.08",
    "Taiwan Semiconductor Manufacturing TSM 10.098 $448.06 $150.38 $3,005.86 $4,524.34",
  ].join("\n")
  it("reads shares and cost, and flags a ticker it had to guess", () => {
    const out = parseHoldingsText(lines)!
    assert.ok(out)
    const by = Object.fromEntries(out.rows.map((r) => [r.symbol, r]))
    assert.equal(by.AMD!.quantity, 22.5)
    assert.equal(by.PLTR!.avgCost, 35.48)
    assert.equal(by.TSM!.quantity, 10.098)
    // SPDR looks like a ticker; whichever it picked, the row must say it isn't sure.
    const xlv = out.rows.find((r) => r.quantity === 10.038)!
    assert.ok(xlv.symbol === "XLV" || xlv.flag, "wrong ticker without a warning")
  })
})
