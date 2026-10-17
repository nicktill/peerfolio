import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { FIGURES, figureFor, pickHoldings, specToFigure } from "./figures.ts"
import { isVisual } from "./visuals.ts"
import type { XRay } from "./portfolio-xray.ts"

const x = JSON.parse(readFileSync(new URL("../../../scripts/fixtures/assistant-xray.json", import.meta.url), "utf8")) as XRay

describe("figureFor", () => {
  it("draws a well-formed card for every kind that has one, and none for xray/none", () => {
    for (const k of FIGURES) {
      const card = figureFor(k, x, ["NVDA", "AAPL"])
      if (k === "xray" || k === "none") assert.equal(card, null, k)
      else assert.ok(card && isVisual(card), k)
    }
  })
  it("uses different card kinds for different questions", () => {
    const kinds = new Set(["risk", "sectors", "performance", "contributors", "holding", "compare"].map((k) => figureFor(k as never, x, ["NVDA", "AAPL"])?.kind))
    assert.equal(kinds.size, 6)
    assert.ok(kinds.has("risk") && kinds.has("performance") && kinds.has("holding") && kinds.has("compare") && kinds.has("contributors") && kinds.has("breakdown"))
  })
  it("finds named holdings by ticker or name, falling back to the largest", () => {
    assert.deepEqual(pickHoldings(x, ["aapl", "nvidia"]).map((h) => h.ticker), ["AAPL", "NVDA"])
    const spot = figureFor("holding", x, ["nope"])
    assert.equal(spot?.kind === "holding" && spot.name, "NVDA")
    const cmp = figureFor("compare", x, null)
    assert.equal(cmp?.kind === "compare" && cmp.rows.length, 3)
  })
  it("rejects malformed new cards", () => {
    assert.equal(isVisual({ kind: "risk", bars: [{ label: 1, percent: 2, line: null }] }), false)
    assert.equal(isVisual({ kind: "compare", rows: [] }), true)
    assert.equal(isVisual({ kind: "holding", name: "X" }), false)
  })
})

describe("specToFigure", () => {
  const row = (label: string, value: string | null, number: number | null, detail: string | null = null) => ({ label, value, number, detail })
  it("draws each spec type from typed rows", () => {
    assert.equal(specToFigure({ type: "timeline", title: "Plan", items: [row("Step", "May", null)] })?.kind, "timeline")
    assert.equal(specToFigure({ type: "calendar", title: "Dividends", items: [row("VTI", "Dec 22", 61)] })?.kind, "calendar")
    assert.equal(specToFigure({ type: "checklist", title: "Do", items: [row("One", null, null, "why")] })?.kind, "checklist")
    assert.equal(specToFigure({ type: "stats", title: "Grid", items: [row("Cash", "$3,000", null)] })?.kind, "stats")
    assert.equal(specToFigure({ type: "donut", title: "Mix", items: [row("A", null, 60), row("B", null, 40)] })?.kind, "donut")
  })
  it("falls back to nothing (plain text) when the spec is unusable", () => {
    assert.equal(specToFigure({ type: "timeline", title: "", items: [row("Step", "May", null)] }), null)
    assert.equal(specToFigure({ type: "stats", title: "Grid", items: [] }), null)
    assert.equal(specToFigure({ type: "script", title: "x", items: [] }), null)
    assert.equal(specToFigure({ type: "donut", title: "Mix", items: [row("A", null, null)] }), null)
    assert.equal(specToFigure({}), null)
  })
  it("clamps long text and row counts", () => {
    const many = Array.from({ length: 30 }, (_, i) => row("x".repeat(500) + i, "May", null))
    const t = specToFigure({ type: "timeline", title: "t".repeat(200), items: many })
    assert.ok(t && t.kind === "timeline" && t.events.length === 8 && t.title.length === 60 && t.events[0]!.title.length === 120)
  })
  it("builds the app-derived ring, grid, slider and checklist", () => {
    const s = figureFor("scenario", x, ["NVDA"])
    assert.ok(s?.kind === "scenario" && s.subject === "NVDA" && s.exposure > 30)
    const whole = figureFor("scenario", x)
    assert.ok(whole?.kind === "scenario" && whole.exposure === 100)
    for (const k of ["donut", "stats", "checklist"] as const) assert.ok(isVisual(figureFor(k, x)), k)
  })
})
