import test from "node:test"
import assert from "node:assert/strict"
import { evaluateBudget, budgetReport, type BudgetSnapshot } from "./infrastructure-budget.ts"
import { readInfrastructureBudget } from "./infrastructure-budget-reader.ts"
const now = Date.parse("2026-10-23T12:00:00Z")
const snapshot = (used = 40): BudgetSnapshot => ({ scope: "example-project", unit: "CU-hours", used, limit: 100, periodStart: "2026-10-01T00:00:00Z", periodEnd: "2026-11-01T00:00:00Z", observedAt: new Date(now).toISOString(), source: "console" })
const evaluate = (s: unknown) => evaluateBudget("Neon", s, "example-project", "CU-hours", now)
test("thresholds and projected overrun fail before exhaustion", () => {
  assert.equal(evaluate(snapshot(40)).status, "healthy")
  assert.equal(evaluate(snapshot(60)).status, "watch")
  assert.equal(evaluate(snapshot(75)).status, "warning")
  assert.equal(evaluate(snapshot(90)).status, "critical")
  const early = evaluateBudget("Neon", { ...snapshot(50), observedAt: "2026-10-10T00:00:00Z" }, "example-project", "CU-hours", Date.parse("2026-10-10T00:00:00Z"))
  assert.equal(early.status, "warning")
  assert.ok((early.forecast ?? 0) > 100)
  assert.equal(budgetReport([early], now).failed, true)
})
test("rejects missing, stale, future, wrong scope, units and malformed readings", () => {
  for (const s of [null, {}, { ...snapshot(), scope: "organization-total" }, { ...snapshot(), unit: "seconds" }, { ...snapshot(), used: "0" }, { ...snapshot(), used: -1 }, { ...snapshot(), limit: 0 }, { ...snapshot(), observedAt: "2026-10-20T00:00:00Z" }, { ...snapshot(), observedAt: "2026-10-24T00:00:00Z" }, { ...snapshot(), periodStart: "0001-01-01T00:00:00Z" }, { ...snapshot(), periodEnd: "2026-10-22T00:00:00Z" }, { ...snapshot(), source: "unknown" }]) {
    assert.equal(evaluate(s).status, "unknown")
    assert.equal(budgetReport([evaluate(s)], now).failed, true)
  }
})
test("forecast uses observation time; zero usage and first day avoid invalid rates", () => {
  const old = { ...snapshot(40), observedAt: "2026-10-22T12:00:00Z" }
  assert.equal(evaluate(old).forecast, evaluateBudget("Neon", old, "example-project", "CU-hours", Date.parse(old.observedAt)).forecast)
  assert.equal(evaluate(snapshot(0)).runwayDays, null)
  const first = { ...snapshot(), periodStart: "2026-10-23T00:00:00Z" }
  assert.equal(evaluate(first).forecast, undefined)
})
test("unconfigured monitoring is explicit unknown, not safe zero and no request", async () => {
  const report = await readInfrastructureBudget({}, now, async () => { throw new Error("must not call") })
  assert.equal(report.failed, true)
  assert.equal(report.metrics.length, 3)
  assert.ok(report.metrics.every(m => m.status === "unknown" && !m.snapshot))
})
test("verified GetProject adapter converts seconds only for exact current project", async () => {
  const env = { NEON_PROJECT_ID: "example-project", NEON_API_KEY: "test-secret", NEON_PROJECT_COUNTER_VERIFIED: "true" }
  const request: typeof fetch = async (url, init) => {
    assert.equal(url, "https://console.neon.tech/api/v2/projects/example-project")
    assert.equal(init?.redirect, "error")
    assert.equal(init?.cache, "no-store")
    return Response.json({ project: { id: "example-project", compute_time_seconds: 144000, consumption_period_start: snapshot().periodStart, consumption_period_end: snapshot().periodEnd } })
  }
  const report = await readInfrastructureBudget(env, now, request)
  assert.equal(report.metrics[0]?.snapshot?.used, 40)
  assert.equal(report.metrics[0]?.snapshot?.source, "neon-project-estimate")
  assert.equal(report.failed, true, "Vercel remains visibly unmonitored")
  for (const body of [{ project: { id: "wrong-project", compute_time_seconds: 0 } }, { project: { id: "example-project", compute_time_seconds: "0" } }, { project: { id: "example-project", compute_time_seconds: 0, consumption_period_start: "0001-01-01T00:00:00Z", consumption_period_end: "0001-01-01T00:00:00Z" } }]) {
    const result = await readInfrastructureBudget(env, now, async () => Response.json(body))
    assert.equal(result.metrics[0]?.status, "unknown")
  }
})
test("provider failure never exposes response bodies or credentials", async () => {
  const result = await readInfrastructureBudget({ NEON_PROJECT_ID: "example-project", NEON_API_KEY: "secret", NEON_PROJECT_COUNTER_VERIFIED: "true" }, now, async () => new Response("secret detail", { status: 401 }))
  assert.equal(result.metrics[0]?.status, "unknown")
  assert.ok(!JSON.stringify(result).includes("secret"))
})
test("manual snapshots and all monitored metrics can pass; malformed manual never silently falls back", async () => {
  const cpu = { ...snapshot(1), scope: "example-team", unit: "CPU-hours", limit: 4 }
  const invocations = { ...cpu, unit: "invocations", used: 1000, limit: 1_000_000 }
  const env = { NEON_PROJECT_ID: "example-project", INFRA_NEON_SNAPSHOT: JSON.stringify(snapshot()), INFRA_VERCEL_SCOPE: "example-team", INFRA_VERCEL_CPU_SNAPSHOT: JSON.stringify(cpu), INFRA_VERCEL_INVOCATIONS_SNAPSHOT: JSON.stringify(invocations) }
  assert.equal((await readInfrastructureBudget(env, now)).failed, false)
  assert.equal((await readInfrastructureBudget({ ...env, INFRA_NEON_SNAPSHOT: "malformed" }, now)).metrics[0]?.status, "unknown")
})
