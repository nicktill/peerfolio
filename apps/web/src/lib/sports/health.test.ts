import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { publicationHealth } from "./health.ts"

describe("sports publish job health", () => {
  it("fails the job when all odds sources fail", () => {
    assert.equal(publicationHealth([{ rejected: "stale_snapshot", notes: ["the-odds-api: failed (503)"] }]).httpStatus, 503)
  })
  it("reports a fallback failure as degraded without discarding usable data", () => {
    const h = publicationHealth([{ rejected: null, notes: ["a: failed (503)", "b: 12 events, 3 credits"] }])
    assert.equal(h.status, "degraded")
    assert.equal(h.httpStatus, 200)
  })
  it("treats empty schedules as normal and quota skips as visible budget limits", () => {
    assert.equal(publicationHealth([{ rejected: null, notes: ["no fetch: nothing unlocked"] }]).status, "ok")
    const h = publicationHealth([{ rejected: "stale_snapshot", notes: ["a: skipped, credit pace used up (20 today, 100 this month)"] }])
    assert.equal(h.status, "budget_limited")
    assert.equal(h.httpStatus, 200)
  })
})

describe("exchange publish health", () => {
  it("one sport's failed fetch is degraded, all of them failing is down, an unfetched sport is neither", () => {
    const failed = { rejected: "fetch_failed", notes: ["exchange: failed (gamma 502)"] }
    const fine = { rejected: null, notes: ["exchange: 5 of 5 scheduled games priced"] }
    const skipped = { rejected: null, notes: ["no fetch: nothing unlocked and no game in the next 24h, or this window's fetch was already taken"] }
    assert.equal(publicationHealth([failed, fine, skipped]).status, "degraded")
    assert.equal(publicationHealth([failed, failed, skipped]).httpStatus, 503)
    assert.equal(publicationHealth([skipped, skipped]).status, "ok")
  })
  it("a reached call cap is a visible budget limit, not a failure", () => {
    const h = publicationHealth([{ rejected: "call_cap", notes: ["exchange: skipped, call cap reached (call cap reached for nba)"] }])
    assert.equal(h.status, "budget_limited")
    assert.equal(h.httpStatus, 200)
  })
})
