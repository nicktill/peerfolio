import assert from "node:assert/strict"
import { test } from "node:test"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import { jobsFor, marketHoursNewYork } from "../src/schedule.ts"

const at = (iso: string) => new Date(iso)
const names = (iso: string, sports = true) => jobsFor(at(iso), { sports }).map((j) => j.path)

// 2026-10-19 is a Monday, 2026-10-17 a Saturday, 2026-10-18 a Sunday.
test("prices: every 15 minutes through the weekday UTC session, never on a weekend afternoon", () => {
  assert.ok(names("2026-10-19T14:00:00Z").includes("/api/cron/prices"))
  assert.ok(names("2026-10-19T14:15:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-19T14:05:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-19T14:03:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-17T14:00:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-18T14:00:00Z").includes("/api/cron/prices"))
})

test("prices: the after-close, evening and 6:15am passes", () => {
  assert.ok(names("2026-10-19T22:15:00Z").includes("/api/cron/prices"))
  assert.ok(!names("2026-10-19T22:10:00Z").includes("/api/cron/prices"))
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

test("sports: settle and publish share each quarter-hour awake period, only when enabled", () => {
  for (let m = 0; m < 60; m++) {
    const iso = `2026-10-18T03:${String(m).padStart(2, "0")}:00Z`
    const paths = names(iso)
    assert.equal(paths.includes("/api/cron/sports/settle"), m % 15 === 0, `settle minute ${m}`)
    assert.equal(paths.includes("/api/cron/sports/publish"), m % 15 === 0, `publish minute ${m}`)
    assert.deepEqual(names(iso, false), [])
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

// Read the real workflow so a future schedule edit cannot silently leave the replacement behind.
const workflow = (name: string) => readFileSync(new URL(`../../../.github/workflows/${name}.yml`, import.meta.url), "utf8")
function matches(field: string, value: number): boolean {
  return field.split(",").some((part) => {
    const [range, stepText] = part.split("/")
    const step = Number(stepText ?? 1)
    if (range === "*") return value % step === 0
    const [lo, hi = lo] = range!.split("-").map(Number)
    return value >= lo! && value <= hi! && (value - lo!) % step === 0
  })
}

test("replacement prices match every scheduled minute of the current GitHub week", () => {
  const crons = [...workflow("prices").matchAll(/cron: "([^"]+)"/g)].map((m) => m[1]!.split(" "))
  assert.equal(crons.length, 5)
  const monday = Date.parse("2026-10-19T00:00:00Z")
  for (let minute = 0; minute < 7 * 24 * 60; minute++) {
    const now = new Date(monday + minute * 60_000)
    const expected = crons.some(([m, h, , , dow]) => matches(m!, now.getUTCMinutes()) && matches(h!, now.getUTCHours()) && matches(dow!, now.getUTCDay()))
    assert.equal(jobsFor(now, { sports: false }).some((job) => job.name === "prices"), expected, now.toISOString())
  }
})

test("all six close-capture attempts remain reachable in summer, winter and early-close sessions", () => {
  for (const close of ["2026-10-19T20:00:00Z", "2026-12-07T21:00:00Z", "2026-11-27T18:00:00Z"]) {
    for (const offset of [45, 75, 90, 120, 165, 210]) {
      const now = new Date(Date.parse(close) + offset * 60_000)
      assert.ok(jobsFor(now, { sports: false }).some((job) => job.name === "prices"), now.toISOString())
    }
  }
})

test("GitHub requires deliberate scheduler selection; manual recovery still works", () => {
  const sports = workflow("sports")
  for (const job of ["publish", "settle"]) {
    const expression = sports.match(new RegExp(`  ${job}:\\n    if: \\$\\{\\{ (.+) \\}\\}`))?.[1]
    assert.ok(expression, `missing ${job} guard`)
    const enabled = (event: string, owner: string, flag: string, input: string) => runInNewContext(expression!, {
      github: { event_name: event, event: { schedule: "*/15 * * * *" } },
      vars: { SPORTS_CRON_ENABLED: flag, SPORTS_SCHEDULER: owner }, inputs: { job: input },
    })
    assert.equal(enabled("schedule", "", "1", ""), false)
    assert.equal(enabled("schedule", "vercel", "1", ""), false)
    assert.equal(enabled("schedule", "github", "0", ""), false)
    assert.equal(enabled("schedule", "github", "1", ""), true)
    assert.equal(enabled("workflow_dispatch", "", "", job), true)
    assert.equal(enabled("workflow_dispatch", "", "", "latency"), false)
  }
  const vercel = JSON.parse(readFileSync(new URL("../../../apps/web/vercel.json", import.meta.url), "utf8"))
  for (const job of ["publish", "settle"]) {
    assert.ok(vercel.crons.some((cron: { path: string; schedule: string }) => cron.path === `/api/cron/sports/${job}` && cron.schedule === "*/15 * * * *"))
  }
  assert.match(readFileSync(new URL("../wrangler.toml", import.meta.url), "utf8"), /DRY_RUN = "1"/)
})

test("news, snapshot and sports match current workflow and Vercel schedules for a full week", () => {
  const vercel = JSON.parse(readFileSync(new URL("../../../apps/web/vercel.json", import.meta.url), "utf8"))
  const githubCrons = (name: string) => [...workflow(name).matchAll(/cron: "([^"]+)"/g)].map((match) => match[1]!.split(" "))
  const expectedCrons: Record<string, string[][]> = {
    news: [...githubCrons("news"), ...vercel.crons.filter((cron: { path: string }) => cron.path === "/api/cron/news").map((cron: { schedule: string }) => cron.schedule.split(" "))],
    snapshot: vercel.crons.filter((cron: { path: string }) => cron.path === "/api/cron/snapshot").map((cron: { schedule: string }) => cron.schedule.split(" ")),
    "sports-settle": githubCrons("sports"),
    "sports-publish": githubCrons("sports"),
  }
  for (const [name, crons] of Object.entries(expectedCrons)) {
    assert.ok(crons.length > 0, `missing source schedule for ${name}`)
    for (let minute = 0; minute < 7 * 24 * 60; minute++) {
      const now = new Date(Date.parse("2026-10-19T00:00:00Z") + minute * 60_000)
      const expected = crons.some(([m, h, , , dow]) => matches(m!, now.getUTCMinutes()) && matches(h!, now.getUTCHours()) && matches(dow!, now.getUTCDay()))
      assert.equal(jobsFor(now, { sports: true }).some((job) => job.name === name), expected, `${name} ${now.toISOString()}`)
    }
  }
})
