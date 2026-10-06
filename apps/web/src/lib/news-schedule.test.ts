import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { scheduledNewsSlot, canPublishDaily } from "./news-schedule.ts"
const at = (s: string) => new Date(s)
describe("News daily scheduling", () => {
  it("accepts only the correct summer and winter morning windows", () => {
    assert.equal(scheduledNewsSlot(at("2026-10-06T15:59:00Z"), "morning"), "morning")
    assert.equal(scheduledNewsSlot(at("2026-10-06T16:00:00Z"), "morning"), null)
    assert.equal(scheduledNewsSlot(at("2026-12-01T15:59:00Z"), "morning"), null)
    assert.equal(scheduledNewsSlot(at("2026-12-01T16:59:00Z"), "morning"), "morning")
  })
  it("accepts the full delayed closing window and rejects the other offset", () => {
    assert.equal(scheduledNewsSlot(at("2026-10-06T20:30:00Z"), "close"), "close")
    assert.equal(scheduledNewsSlot(at("2026-10-06T21:29:00Z"), "close"), "close")
    assert.equal(scheduledNewsSlot(at("2026-10-06T21:30:00Z"), "close"), null)
    assert.equal(scheduledNewsSlot(at("2026-12-01T21:30:00Z"), "close"), "close")
  })
  it("skips holidays/weekends but supports early-close trading days", () => {
    assert.equal(scheduledNewsSlot(at("2026-12-25T16:30:00Z"), "morning"), null)
    assert.equal(scheduledNewsSlot(at("2026-10-10T15:30:00Z"), "morning"), null)
    assert.equal(scheduledNewsSlot(at("2026-11-27T21:30:00Z"), "close"), "close")
  })
  it("replaces a morning brief once after close and never regresses a closing brief", () => {
    const morning = at("2026-10-06T15:10:00Z"), close = at("2026-10-06T20:40:00Z")
    assert.equal(canPublishDaily("morning", null, "2026-10-06"), true)
    assert.equal(canPublishDaily("morning", morning, "2026-10-06"), false)
    assert.equal(canPublishDaily("close", morning, "2026-10-06"), true)
    assert.equal(canPublishDaily("close", close, "2026-10-06"), false)
    assert.equal(canPublishDaily("morning", close, "2026-10-06"), false)
  })
})
