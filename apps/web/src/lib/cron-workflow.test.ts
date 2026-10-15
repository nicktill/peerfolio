import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { cronWindow } from "./cron-window.ts"

/** The cron expressions of the real workflow file. */
const workflow = readFileSync(join(import.meta.dirname, "..", "..", "..", "..", ".github", "workflows", "prices.yml"), "utf8")
const expressions = [...workflow.matchAll(/^\s*-\s*cron:\s*"([^"]+)"/gm)].map((m) => m[1]!)

/** The values one cron field allows: `*`, lists, ranges, steps (step lists like 5/10). Day of week 7 is Sunday. */
function field(spec: string, min: number, max: number): Set<number> {
  const out = new Set<number>()
  for (const part of spec.split(",")) {
    const [range, step] = part.split("/")
    const [from, to] = range === "*" ? [min, max] : range!.includes("-") ? range!.split("-").map(Number) : [Number(range), step ? max : Number(range)]
    for (let v = from!; v <= to!; v += step ? Number(step) : 1) out.add(max === 6 && v === 7 ? 0 : v)
  }
  return out
}

function matcher(expression: string) {
  const [minute, hour, dom, month, dow] = expression.trim().split(/\s+/)
  const sets = [field(minute!, 0, 59), field(hour!, 0, 23), field(dom!, 1, 31), field(month!, 1, 12), field(dow!, 0, 6)]
  return (at: Date) =>
    sets[0]!.has(at.getUTCMinutes()) && sets[1]!.has(at.getUTCHours()) && sets[2]!.has(at.getUTCDate()) && sets[3]!.has(at.getUTCMonth() + 1) && sets[4]!.has(at.getUTCDay())
}

describe("prices.yml schedule", () => {
  it("parses its cron expressions", () => {
    assert.ok(expressions.length >= 4)
    assert.equal(matcher("*/5 13-21 * * 1-5")(new Date("2026-10-13T13:30:00Z")), true)
    assert.equal(matcher("*/5 13-21 * * 1-5")(new Date("2026-10-17T13:30:00Z")), false) // Saturday
    assert.equal(matcher("15 10,11 * * *")(new Date("2026-10-17T11:15:00Z")), true)
    assert.equal(matcher("15 10,11 * * *")(new Date("2026-10-17T11:20:00Z")), false)
  })

  it("has a workflow tick within 5 minutes after every window start, every minute of 2026 (both DST changes)", () => {
    const ticks = expressions.map(matcher)
    const isTick = (t: number) => ticks.some((m) => m(new Date(t)))
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
