import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { toolLabel } from "./tool-labels.ts"
import { TOOL_DEFS } from "./tool-defs.ts"

describe("toolLabel", () => {
  it("has a label for every tool", () => {
    for (const t of TOOL_DEFS) assert.ok(toolLabel(t.name, "{}"), t.name)
  })
  it("names the benchmark and the tickers being looked up", () => {
    assert.equal(toolLabel("compare_to_benchmark", '{"symbol":"spy","range":"3M"}'), "Comparing with the S&P 500")
    assert.equal(toolLabel("get_quotes", '{"symbols":["nvda","MU"]}'), "Pulling quotes for NVDA, MU")
  })
  it("never puts odd model-written text on screen", () => {
    assert.equal(toolLabel("get_quotes", '{"symbols":["<script>"]}'), "Pulling live quotes")
    assert.equal(toolLabel("compare_to_benchmark", "not json"), "Comparing with the benchmark")
    assert.equal(toolLabel("nope"), undefined)
  })
})
