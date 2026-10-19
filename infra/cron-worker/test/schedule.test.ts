import assert from "node:assert/strict"
import { test } from "node:test"
import { jobsFor, marketHoursNewYork } from "../src/schedule.ts"

const at = (iso: string) => new Date(iso)
const names = (iso: string, sports = true) => jobsFor(at(iso), { sports }).map((j) => j.path)

// 2026-10-19 is a Monday, 2026-10-17 a Saturday, 2026-10-18 a Sunday.
test("prices: every 5 minutes through the weekday UTC session, never on a weekend afternoon", () => {
  assert.ok(names("2026-10-19T14:00:00Z").includes("/api/cron/prices"))
  assert.ok(names("2026-10-19T14:05:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-19T14:03:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-17T14:00:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-18T14:00:00Z").includes("/api/cron/prices"))
})

test("prices: the after-close, evening and 6:15am passes", () => {
  assert.ok(names("2026-10-19T22:10:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-19T22:05:00Z").includes("/api/cron/prices"))
  assert.ok(names("2026-10-19T23:05:00Z").includes("/api/cron/prices"))
  // 00:05 UTC Tuesday through Saturday is the same US evening; Sunday and Monday 00:05 are not
  assert.ok(names("2026-10-20T00:05:00Z").includes("/api/cron/prices"))
  assert.ok(names("2026-10-24T00:05:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-25T00:05:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-26T00:05:00Z").includes("/api/cron/prices"))
  // 6:15am New York: 10:15 and 11:15 UTC, every day including weekends
  assert.ok(names("2026-10-17T10:15:00Z").includes("/api/cron/prices"))
  assert.ok(names("2026-10-18T11:15:00Z").includes("/api/cron/prices"))
})

test("news: the weekday slots only", () => {
  assert.ok(names("2026-10-19T11:00:00Z").includes("/api/cron/news"))
  assert.ok(names("2026-10-19T15:15:00Z").includes("/api/cron/news"))
  assert.ok(names("2026-10-19T21:20:00Z").includes("/api/cron/news"))
  assert.ok(names("2026-10-19T22:00:00Z").includes("/api/cron/news"))
  assert.ok(!names("2026-10-17T11:00:00Z").includes("/api/cron/news"))
  assert.ok(!names("2026-10-19T11:30:00Z").includes("/api/cron/news"))
})

test("snapshot: 22:30 UTC every day", () => {
  assert.ok(names("2026-10-19T22:30:00Z").includes("/api/cron/snapshot"))
  assert.ok(names("2026-10-17T22:30:00Z").includes("/api/cron/snapshot"))
  assert.ok(!names("2026-10-19T22:31:00Z").includes("/api/cron/snapshot"))
})

test("sports: settle at minutes 2,7,...,57 and publish every 15, only when enabled", () => {
  assert.ok(names("2026-10-18T03:02:00Z").includes("/api/cron/sports/settle"))
  assert.ok(names("2026-10-18T03:57:00Z").includes("/api/cron/sports/settle"))
  assert.ok(!names("2026-10-18T03:05:00Z").includes("/api/cron/sports/settle"))
  assert.ok(names("2026-10-18T03:00:00Z").includes("/api/cron/sports/publish"))
  assert.ok(names("2026-10-18T03:45:00Z").includes("/api/cron/sports/publish"))
  assert.ok(!names("2026-10-18T03:10:00Z").includes("/api/cron/sports/publish"))
  assert.deepEqual(names("2026-10-18T03:02:00Z", false), [])
})

test("settle and publish never land in the same minute", () => {
  for (let m = 0; m < 60; m++) {
    const p = names(`2026-10-18T03:${String(m).padStart(2, "0")}:00Z`)
    assert.ok(!(p.includes("/api/cron/sports/settle") && p.includes("/api/cron/sports/publish")), `minute ${m}`)
  }
})

test("warm: only with prices, and only while the New York market is open", () => {
  // 14:00 UTC Monday in October is 10:00 New York (EDT): warm runs
  const open = jobsFor(at("2026-10-19T14:00:00Z"), { sports: false })
  assert.equal(open.filter((j) => j.name === "warm").length, 4)
  // 13:00 UTC is 9:00 New York, before the open: prices run, warm does not
  const early = jobsFor(at("2026-10-19T13:00:00Z"), { sports: false })
  assert.ok(early.some((j) => j.name === "prices"))
  assert.equal(early.filter((j) => j.name === "warm").length, 0)
})

test("marketHoursNewYork follows daylight saving", () => {
  assert.equal(marketHoursNewYork(at("2026-10-19T13:30:00Z")), true) // 9:30 EDT
  assert.equal(marketHoursNewYork(at("2026-10-19T13:29:00Z")), false)
  assert.equal(marketHoursNewYork(at("2026-12-07T14:30:00Z")), true) // 9:30 EST (Monday)
  assert.equal(marketHoursNewYork(at("2026-12-07T14:29:00Z")), false)
  assert.equal(marketHoursNewYork(at("2026-10-17T15:00:00Z")), false) // Saturday
})

test("a quiet minute has nothing to do", () => {
  assert.deepEqual(names("2026-10-17T03:01:00Z"), [])
})
