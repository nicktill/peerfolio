import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { cronWindow } from "./cron-window.ts"

import { jobsFor } from "../../../../infra/cron-worker/src/schedule.ts"

describe("Cloudflare price schedule", () => {
  it("has a Cloudflare tick within 5 minutes after every window start, every minute of 2026 (both DST changes)", () => {
    const isTick = (t: number) => jobsFor(new Date(t), { sports: false }).some((job) => job.name === "prices")
    const MINUTE = 60_000
    const start = Date.UTC(2026, 0, 1)
    const end = Date.UTC(2027, 0, 1)

    // Every minute at which some part of the cron window turns on.
    const flags = ["live", "closeCapture", "funds", "morning"] as const
    let previous = cronWindow(new Date(start - MINUTE))
    const gaps: string[] = []
    let starts = 0
    for (let t = start; t < end; t += MINUTE) {
      const now = cronWindow(new Date(t))
      for (const flag of flags) {
        if (!now[flag] || previous[flag]) continue
        starts++
        let found = false
        for (let d = 0; d <= 5 && !found; d++) found = isTick(t + d * MINUTE)
        if (!found) gaps.push(`${flag} starts ${new Date(t).toISOString()} with no tick in the next 5 minutes`)
      }
      previous = now
    }
    assert.ok(starts > 700, `expected many window starts, saw ${starts}`)
    assert.deepEqual(gaps, [])
  })
})
