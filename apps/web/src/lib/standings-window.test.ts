import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { visibleStandings } from "./standings-window.ts"

const league = (n: number, you: number) => Array.from({ length: n }, (_, i) => ({ rank: i + 1, isYou: i + 1 === you }))

describe("visibleStandings", () => {
  it("shows everyone in a league the size of today's", () => {
    const r = visibleStandings(league(7, 6), { expanded: false })
    assert.equal(r.rows.length, 7)
    assert.equal(r.hidden, 0)
  })

  it("still shows everyone right at the limit", () => {
    assert.equal(visibleStandings(league(12, 12), { expanded: false }).hidden, 0)
  })

  it("folds a big league to the top ten, and keeps you in view when you're further down", () => {
    const r = visibleStandings(league(40, 31), { expanded: false })
    assert.deepEqual(r.rows.map((x) => x.rank), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 31])
    assert.equal(r.hidden, 29)
  })

  it("doesn't repeat you when you're already in the top ten", () => {
    const r = visibleStandings(league(40, 3), { expanded: false })
    assert.equal(r.rows.length, 10)
    assert.equal(r.hidden, 30)
  })

  it("shows everyone once expanded", () => {
    assert.equal(visibleStandings(league(40, 31), { expanded: true }).rows.length, 40)
  })
})
