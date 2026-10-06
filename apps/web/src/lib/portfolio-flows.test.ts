import { test } from "node:test"
import assert from "node:assert/strict"
import { externalAmount, investmentFlowPages } from "./portfolio-flows.ts"
import { timeWeightedReturn } from "./ranges.ts"

test("all investment transaction pages are read, including the second-page deposit", async () => {
  const offsets: number[] = []
  const rows = await investmentFlowPages(async offset => {
    offsets.push(offset)
    return { total_investment_transactions: 501, investment_transactions: Array.from({length: offset === 0 ? 500 : 1}, (_, i) => ({investment_transaction_id: String(offset+i), date: "2026-10-07", amount: -100, type: offset === 0 ? "buy" : "transfer"})) }
  })
  assert.deepEqual(offsets, [0,500])
  assert.equal(rows.reduce((sum, r) => sum + (externalAmount(r) ?? 0), 0), 100)
})
test("incomplete pagination fails rather than publishing a partial flow", async () => {
  await assert.rejects(investmentFlowPages(async () => ({ total_investment_transactions: 1, investment_transactions: [] })))
})
test("provider sign and non-external trades remain unchanged", () => {
  assert.equal(externalAmount({ investment_transaction_id: "a", date: "2026-10-07", amount: -100, type: "cash", subtype: "deposit" }), 100)
  assert.equal(externalAmount({ investment_transaction_id: "b", date: "2026-10-07", amount: 100, type: "cash", subtype: "withdrawal" }), -100)
  assert.equal(externalAmount({ investment_transaction_id: "c", date: "2026-10-07", amount: 100, type: "buy" }), null)
})
test("the duplicated-deposit reproduction has zero return when applied once", () => {
  const points = [{ date: "2026-10-06", investableAssets:1000, netWorth:1000, netFlows:0, isVerified:true },{date:"2026-10-07", investableAssets:1100,netWorth:1100,netFlows:100,isVerified:true}]
  assert.equal(timeWeightedReturn(points).percent, 0)
  assert.ok(Math.abs(timeWeightedReturn([points[0]!,{...points[1]!,netFlows:200}]).percent + 10) < 1e-10)
})
