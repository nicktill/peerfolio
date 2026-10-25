import { test } from "node:test"
import assert from "node:assert/strict"
import { SPORTS_HOLD_UNTIL, sportsOnHold } from "./maintenance.ts"

test("sports is on hold until the end date, then lifts by itself", () => {
  const end = SPORTS_HOLD_UNTIL.getTime()
  assert.equal(sportsOnHold(end - 1, undefined), true)
  assert.equal(sportsOnHold(end, undefined), false)
  assert.equal(sportsOnHold(end + 86_400_000, undefined), false)
})

test("NEXT_PUBLIC_SPORTS_HOLD=off lifts the hold early; anything else leaves it", () => {
  const before = SPORTS_HOLD_UNTIL.getTime() - 3_600_000
  assert.equal(sportsOnHold(before, "off"), false)
  assert.equal(sportsOnHold(before, " OFF "), false)
  assert.equal(sportsOnHold(before, ""), true)
  assert.equal(sportsOnHold(before, "on"), true)
})
