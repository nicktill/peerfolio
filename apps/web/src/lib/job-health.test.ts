import { test } from "node:test"
import assert from "node:assert/strict"
import { priceJobHealthy } from "./job-health.ts"
test("successful quotes cannot mask failed closes or queued fills", () => {
  const live = { claimed:1, refreshed:1 }
  assert.equal(priceJobHealthy(live,{failed:true},{},{}),false)
  assert.equal(priceJobHealthy(live,{}, {},{error:"database unavailable"}),false)
  assert.equal(priceJobHealthy(live,{}, {reason:"provider_error"},{}),false)
})
test("no work, missing optional metadata key and deferred closes are not failures", () => {
  assert.equal(priceJobHealthy({claimed:0,refreshed:0},{},{reason:"missing_key"},{}),true)
  assert.equal(priceJobHealthy({claimed:1,refreshed:0},{},{},{}),false)
})
