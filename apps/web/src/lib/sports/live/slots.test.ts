import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { msToNextSlot, slotElapsed, SLOT_MS, SLOT_OFFSET_MS } from "./slots.ts"

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
