import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { FIXTURES } from "./import-corpus.ts"
import { parseHoldingsText } from "./import-parse.ts"

const near = (a: number | null, b: number | null) => (a == null || b == null ? a === b : Math.abs(a - b) < 1e-6 * Math.max(1, Math.abs(b)))

describe("brokerage corpus", () => {
  for (const f of FIXTURES) {
    it(`${f.name} (${f.via})`, () => {
      const out = parseHoldingsText(f.text)
      if (f.via !== "table") return assert.equal(out, null, "must hand off rather than guess")
      assert.ok(out, "the local reader should read this")
      assert.equal(out.rows.length, f.expect.length, `rows: ${out.rows.map((r) => r.symbol).join(",")}`)
      f.expect.forEach(([symbol, quantity, avg], i) => {
        const r = out.rows[i]!
        assert.equal(r.symbol, symbol)
        assert.ok(near(r.quantity, quantity), `${symbol} quantity ${r.quantity} vs ${quantity}`)
        assert.ok(near(r.avgCost, avg), `${symbol} avg ${r.avgCost} vs ${avg}`)
      })
      assert.deepEqual(out.rows.filter((r) => r.flag).map((r) => r.symbol), [], "numbers should agree")
    })
  }
})

describe("screenshot fixtures", () => {
  it("every mockup has a PNG and an expected answer", async () => {
    const { readFileSync, existsSync } = await import("node:fs")
    const dir = new URL("../../test-fixtures/import-screenshots/", import.meta.url)
    const expected = JSON.parse(readFileSync(new URL("expected.json", dir), "utf8")) as Record<string, unknown[]>
    for (const [name, rows] of Object.entries(expected)) {
      assert.ok(existsSync(new URL(`${name}.png`, dir)), `${name}.png`)
      assert.ok(rows.length > 0)
    }
  })
})
