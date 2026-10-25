import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { inHalfHourBand, inQuietHours, msToNextSlot, parseQuietHours, quietOffSlot, slotElapsed, SLOT_MS, SLOT_OFFSET_MS } from "./slots.ts"

const at = (iso: string) => new Date(iso).getTime()

describe("shared wake slots", () => {
  it("next slot is just after the next quarter hour", () => {
    assert.equal(msToNextSlot(at("2026-10-22T03:31:31Z")), at("2026-10-22T03:45:45Z") - at("2026-10-22T03:31:31Z"))
    assert.equal(msToNextSlot(at("2026-10-22T03:45:45Z")), SLOT_MS)
    assert.equal(msToNextSlot(at("2026-10-22T03:45:44Z")), 1_000)
  })
  it("is always within (0, SLOT_MS]", () => {
    for (let t = 0; t < 3 * SLOT_MS; t += 7_919) {
      const d = msToNextSlot(t)
      assert.ok(d > 0 && d <= SLOT_MS)
    }
  })
  it("elapsed only after a boundary passes", () => {
    const slot = at("2026-10-22T03:45:00Z") + SLOT_OFFSET_MS
    assert.equal(slotElapsed(slot - 60_000, slot - 1), false)
    assert.equal(slotElapsed(slot - 60_000, slot), true)
    assert.equal(slotElapsed(slot, slot + SLOT_MS - 1), false)
    assert.equal(slotElapsed(0, slot), true)
  })
})

describe("quiet hours", () => {
  const Q: [number, number] = [5, 15]
  it("parses the UTC window, off and bad specs", () => {
    assert.deepEqual(parseQuietHours(undefined), [5, 15])
    assert.deepEqual(parseQuietHours("22-6"), [22, 6])
    assert.equal(parseQuietHours("off"), null)
    assert.equal(parseQuietHours("5-5"), null)
    assert.equal(parseQuietHours("5-25"), null)
    assert.equal(parseQuietHours("mornings"), null)
    assert.equal(inQuietHours(at("2026-10-22T23:30:00Z"), [22, 6]), true)
    assert.equal(inQuietHours(at("2026-10-22T07:00:00Z"), [22, 6]), false)
    assert.equal(inQuietHours(at("2026-10-22T15:00:00Z"), Q), false, "end hour is exclusive")
  })
  it("hourly slots inside quiet hours, quarter-hours outside and when not allowed", () => {
    const from = (iso: string) => at(iso)
    assert.equal(msToNextSlot(from("2026-10-22T06:05:00Z"), true, Q), at("2026-10-22T07:00:45Z") - from("2026-10-22T06:05:00Z"))
    assert.equal(msToNextSlot(from("2026-10-22T06:05:00Z"), false, Q), at("2026-10-22T06:15:45Z") - from("2026-10-22T06:05:00Z"))
    assert.equal(msToNextSlot(from("2026-10-22T04:50:00Z"), true, Q), at("2026-10-22T05:00:45Z") - from("2026-10-22T04:50:00Z"))
    assert.equal(msToNextSlot(from("2026-10-22T14:20:00Z"), true, Q), at("2026-10-22T15:00:45Z") - from("2026-10-22T14:20:00Z"))
    assert.equal(msToNextSlot(from("2026-10-22T15:05:00Z"), true, Q), at("2026-10-22T15:15:45Z") - from("2026-10-22T15:05:00Z"))
    assert.equal(msToNextSlot(from("2026-10-22T06:05:00Z"), true, null), at("2026-10-22T06:15:45Z") - from("2026-10-22T06:05:00Z"), "no quiet hours: unchanged")
  })
  it("an hourly slot elapses only at the top of the hour", () => {
    const last = at("2026-10-22T06:00:45Z")
    assert.equal(slotElapsed(last, at("2026-10-22T06:15:45Z"), true, Q), false)
    assert.equal(slotElapsed(last, at("2026-10-22T07:00:44Z"), true, Q), false)
    assert.equal(slotElapsed(last, at("2026-10-22T07:00:45Z"), true, Q), true)
    assert.equal(slotElapsed(last, at("2026-10-22T06:15:45Z"), false, Q), true)
  })
  it("the routes skip every quarter-hour but the top of the hour, only in quiet hours", () => {
    assert.equal(quietOffSlot(at("2026-10-22T06:00:10Z"), Q), false)
    assert.equal(quietOffSlot(at("2026-10-22T06:15:02Z"), Q), true)
    assert.equal(quietOffSlot(at("2026-10-22T14:45:00Z"), Q), true)
    assert.equal(quietOffSlot(at("2026-10-22T15:15:00Z"), Q), false)
    assert.equal(quietOffSlot(at("2026-10-22T04:30:00Z"), Q), false)
    assert.equal(quietOffSlot(at("2026-10-22T06:15:00Z"), null), false)
  })
  it("the worker's hourly slot shares the routes' top-of-hour run", () => {
    // Routes fire on the boundary and do work only at :00 in quiet hours; the worker's slot is 45 s later in the same awake period.
    const slot = at("2026-10-22T06:05:00Z") + msToNextSlot(at("2026-10-22T06:05:00Z"), true, Q)
    assert.equal(quietOffSlot(slot - SLOT_OFFSET_MS, Q), false)
  })
})

describe("half-hour band (sports-only hours outside quiet hours)", () => {
  const Q = [5, 15] as const satisfies [number, number]
  it("is weekends (but not Saturday 00 UTC, still Friday's price slots) and weekday nights 01-05 UTC, never in quiet hours", () => {
    assert.equal(inHalfHourBand(at("2026-10-24T00:30:00Z"), Q), false, "Saturday 00 UTC")
    assert.equal(inHalfHourBand(at("2026-10-24T01:00:00Z"), Q), true, "Saturday 01 UTC")
    assert.equal(inHalfHourBand(at("2026-10-24T08:00:00Z"), Q), false, "Saturday quiet hours")
    assert.equal(inHalfHourBand(at("2026-10-24T18:00:00Z"), Q), true, "Saturday afternoon")
    assert.equal(inHalfHourBand(at("2026-10-25T23:45:00Z"), Q), true, "Sunday evening")
    assert.equal(inHalfHourBand(at("2026-10-26T02:00:00Z"), Q), true, "Monday 02 UTC")
    assert.equal(inHalfHourBand(at("2026-10-26T05:00:00Z"), Q), false, "Monday 05 UTC is quiet")
    assert.equal(inHalfHourBand(at("2026-10-26T18:00:00Z"), Q), false, "weekday afternoon: price slots run")
    assert.equal(inHalfHourBand(at("2026-10-24T18:00:00Z"), Q, false), false, "SPORTS_HALF_HOURLY=off")
  })
  it("relaxed slots fall on :00 and :30 there; the quarter-hour slot is unchanged when not relaxed", () => {
    const from = at("2026-10-24T18:05:00Z")
    assert.equal(msToNextSlot(from, true, Q), at("2026-10-24T18:30:45Z") - from)
    assert.equal(msToNextSlot(at("2026-10-24T18:31:00Z"), true, Q), at("2026-10-24T19:00:45Z") - at("2026-10-24T18:31:00Z"))
    assert.equal(msToNextSlot(from, false, Q), at("2026-10-24T18:15:45Z") - from)
    assert.equal(msToNextSlot(from, true, Q, false), at("2026-10-24T18:15:45Z") - from, "band off: quarter hour")
    assert.equal(slotElapsed(at("2026-10-24T18:00:45Z"), at("2026-10-24T18:15:45Z"), true, Q), false)
    assert.equal(slotElapsed(at("2026-10-24T18:00:45Z"), at("2026-10-24T18:30:45Z"), true, Q), true)
  })
  it("the routes skip the quarter past and quarter to in the band, and run every quarter hour elsewhere outside quiet hours", () => {
    assert.equal(quietOffSlot(at("2026-10-24T18:00:10Z"), Q), false)
    assert.equal(quietOffSlot(at("2026-10-24T18:15:02Z"), Q), true)
    assert.equal(quietOffSlot(at("2026-10-24T18:30:05Z"), Q), false)
    assert.equal(quietOffSlot(at("2026-10-24T18:45:00Z"), Q), true)
    assert.equal(quietOffSlot(at("2026-10-26T18:15:00Z"), Q), false, "weekday afternoon")
    assert.equal(quietOffSlot(at("2026-10-24T18:15:00Z"), Q, false), false, "band off")
  })
  it("the worker's half-hour slot shares the routes' run", () => {
    const slot = at("2026-10-24T18:05:00Z") + msToNextSlot(at("2026-10-24T18:05:00Z"), true, Q)
    assert.equal(quietOffSlot(slot - SLOT_OFFSET_MS, Q), false)
  })
})
