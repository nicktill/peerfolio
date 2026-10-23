import assert from "node:assert/strict"
import { test } from "node:test"
import worker, { executeJobs } from "../src/index.ts"

const env = { APP_URL: "https://example.test/", CRON_SECRET: "test-secret" }
const when = new Date("2026-10-19T14:00:00Z")
const prices = { name: "prices" as const, path: "/api/cron/prices" }

test("critical HTTP failures reject after three attempts and preserve authentication", async () => {
  const calls: RequestInit[] = []
  const delays: number[] = []
  await assert.rejects(executeJobs(env, [prices], when, {
    fetch: async (_url, init) => { calls.push(init!); return new Response("unavailable", { status: 503 }) },
    sleep: async (ms) => { delays.push(ms) },
  }), AggregateError)
  assert.equal(calls.length, 3)
  assert.deepEqual(delays, [10_000, 10_000])
  assert.equal((calls[0]!.headers as Record<string, string>).Authorization, "Bearer test-secret")
  assert.equal(calls[0]!.redirect, "manual")
})

test("network failure and redirect retry, then success resolves", async () => {
  let calls = 0
  await executeJobs(env, [prices], when, {
    fetch: async () => { calls++; if (calls === 1) throw new Error("network unavailable"); return new Response(null, { status: calls === 2 ? 302 : 200 }) },
    sleep: async () => {},
  })
  assert.equal(calls, 3)
})

test("optional warm failures do not fail critical success and never send the secret", async () => {
  let warms = 0
  await executeJobs(env, [prices, { name: "warm", path: "/api/news" }], when, {
    fetch: async (url, init) => {
      if (String(url).includes("/api/news?warm=")) {
        warms++
        assert.deepEqual(init!.headers, {})
        return new Response(null, { status: 500 })
      }
      return new Response(null, { status: 200 })
    },
    sleep: async () => {},
  })
  assert.equal(warms, 1)
})

test("waits for successful siblings before reporting critical exhaustion", async () => {
  let release!: () => void
  let finished = false
  const pending = executeJobs(env, [prices, { name: "snapshot", path: "/api/cron/snapshot" }], when, {
    fetch: async (url) => {
      if (String(url).endsWith("snapshot")) { await new Promise<void>((resolve) => { release = resolve }); finished = true; return new Response(null, { status: 200 }) }
      return new Response(null, { status: 500 })
    },
    sleep: async () => {},
  })
  await Promise.resolve()
  assert.equal(finished, false)
  release()
  await assert.rejects(pending, AggregateError)
  assert.equal(finished, true)
})

test("missing secret fails a live scheduled invocation before dispatch", async () => {
  let dispatched = false
  await assert.rejects(worker.scheduled({ scheduledTime: when.getTime() }, { ...env, CRON_SECRET: "" }, { waitUntil: () => { dispatched = true } }), /CRON_SECRET is not set/)
  assert.equal(dispatched, false)
})

test("dry run can validate schedules without a secret and never dispatches", async () => {
  await worker.scheduled({ scheduledTime: when.getTime() }, { ...env, CRON_SECRET: "", DRY_RUN: "1" }, { waitUntil: () => { assert.fail("dry run dispatched a request") } })
})

test("default fetch preserves the native global receiver", async () => {
  const original = globalThis.fetch
  let called = false
  globalThis.fetch = function (this: unknown) {
    assert.equal(this, globalThis)
    called = true
    return Promise.resolve(new Response(null, { status: 200 }))
  } as typeof fetch
  try {
    await executeJobs(env, [prices], when)
    assert.equal(called, true)
  } finally {
    globalThis.fetch = original
  }
})
