import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { cronWindow } from "./cron-window.ts"

const w = (iso: string) => cronWindow(new Date(iso))

describe("cronWindow", () => {
  it("live from the open to a few minutes past the close", () => {
    assert.equal(w("2026-10-13T13:35:00Z").live, true) // 09:35 EDT
    assert.equal(w("2026-10-13T20:04:00Z").live, true)
    assert.equal(w("2026-10-13T20:06:00Z").live, false)
    assert.equal(w("2026-12-15T14:35:00Z").live, true) // 09:35 EST
  })

  it("is idle between the live grace and the first capture attempt", () => {
    assert.equal(w("2026-10-13T20:29:00Z").any, false) // 16:29
    assert.equal(w("2026-10-13T20:44:00Z").any, false) // 16:44
    assert.equal(w("2026-10-13T20:46:00Z").closeCapture, true) // 16:46
  })

  it("close capture is a ladder of attempts, not a poll", () => {
    const on = (hhmm: string) => w(`2026-10-13T${hhmm}:00Z`).closeCapture // EDT = UTC-4
    for (const hhmm of ["20:45", "20:59", "21:15", "21:30", "21:44", "22:00", "22:14", "22:45", "22:59", "23:30", "23:44"]) assert.equal(on(hhmm), true, hhmm)
    for (const hhmm of ["20:34", "20:44", "21:00", "21:14", "21:45", "21:59", "22:15", "22:30", "22:44", "23:00", "23:15", "23:29", "23:45", "23:59"]) assert.equal(on(hhmm), false, hhmm)
  })

  it("close capture ends at 20:00, funds run 19:00-23:00", () => {
    assert.equal(w("2026-10-13T23:35:00Z").closeCapture, true) // 19:35
    assert.equal(w("2026-10-13T23:35:00Z").funds, true)
    assert.equal(w("2026-10-14T00:05:00Z").closeCapture, false) // 20:05
    assert.equal(w("2026-10-14T00:05:00Z").funds, true)
    assert.equal(w("2026-10-14T03:05:00Z").any, false) // 23:05
  })

  it("the 06:15 pass is the only one on weekends and holidays", () => {
    assert.equal(w("2026-10-17T10:15:00Z").morning, true) // Sat 06:15 EDT
    assert.equal(w("2026-10-17T16:00:00Z").any, false) // Sat noon
    assert.equal(w("2026-10-17T21:00:00Z").any, false)
    assert.equal(w("2026-10-18T23:30:00Z").any, false) // Sunday evening
    assert.equal(w("2026-09-07T15:00:00Z").any, false) // Labor Day
    assert.equal(w("2026-09-07T10:15:00Z").morning, true)
    assert.equal(w("2026-09-07T22:00:00Z").any, false)
  })

  it("is daylight-saving safe at 06:15", () => {
    assert.equal(w("2026-03-09T10:15:00Z").morning, true) // EDT
    assert.equal(w("2026-03-09T11:15:00Z").morning, false) // 07:15 EDT
    assert.equal(w("2026-03-06T11:15:00Z").morning, true) // EST
    assert.equal(w("2026-03-06T10:15:00Z").morning, false) // 05:15 EST
    assert.equal(w("2026-11-02T11:15:00Z").morning, true)
    assert.equal(w("2026-11-02T10:15:00Z").morning, false)
    assert.equal(w("2026-11-02T21:46:00Z").closeCapture, true) // 16:46 EST
  })

  it("early close day: live to 13:05, capture from 13:30", () => {
    assert.equal(w("2026-11-27T18:04:00Z").live, true)
    assert.equal(w("2026-11-27T18:10:00Z").any, false)
    assert.equal(w("2026-11-27T18:46:00Z").closeCapture, true) // 13:46
  })
})
