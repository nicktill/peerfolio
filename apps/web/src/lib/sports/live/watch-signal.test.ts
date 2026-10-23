import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { WatchSignal } from "./watch-signal.ts"

describe("watch signal", () => {
  it("the first mark is a baseline; a new mark is a change; the same mark is not", async () => {
    const marks = ["a", "a", "b", "b", "c"]
    const s = new WatchSignal(async () => marks.shift() ?? null)
    assert.deepEqual([await s.changed(), await s.changed(), await s.changed(), await s.changed(), await s.changed()], [false, false, true, false, true])
  })
  it("a failed poll is never a change and keeps the baseline", async () => {
    const answers: (string | null | Error)[] = ["a", null, new Error("down"), "a", "b"]
    const s = new WatchSignal(async () => {
      const x = answers.shift()!
      if (x instanceof Error) throw x
      return x
    })
    const seen = []
    for (let i = 0; i < 5; i++) seen.push(await s.changed())
    assert.deepEqual(seen, [false, false, false, false, true])
  })
})
