import assert from "node:assert/strict"
import { test } from "node:test"
import { createWorkerRunner, type RunnerIO } from "./runner.ts"
import type { WorkerDeps } from "./worker.ts"
import type { LiveSlate } from "./store.ts"

function fixture(offset = -60_000) {
  let now = Date.parse("2026-10-23T20:00:00Z")
  const rows = Object.assign(
    [
      {
        id: "game",
        externalId: "1",
        sport: "nba",
        status: "scheduled",
        startsAt: new Date(now + offset),
        homeName: "Home",
        awayName: "Away",
      },
    ],
    { watched: false },
  ) as LiveSlate
  const calls = {
    load: 0,
    write: 0,
    lock: 0,
    heartbeat: 0,
    reprice: 0,
    next: 0,
  }
  let changed = false
  let preRepriceDue = -1
  const base: WorkerDeps = {
    store: {
      loadSlate: async () => {
        calls.load++
        return rows
      },
      insertQuotes: async () => {
        calls.write++
      },
      upsertState: async () => {},
    },
    getJson: async () => null,
    postJson: async () => null,
  }
  const io: RunnerIO = {
    clock: () => now,
    watch: {
      changed: async () => {
        const value = changed
        changed = false
        return value
      },
    },
    tick: async (deps, _state, date) => {
      const slate = await deps.store.loadSlate(date)
      await deps.store.insertQuotes([])
      return {
        slate: slate.length,
        okCalls: 1,
        failCalls: 0,
        skippedBackoff: 0,
        rowsWritten: 0,
        rowsSkipped: 0,
        matched: 0,
        unmatched: [],
        sources: {},
      }
    },
    reprice: async (_deps, state) => {
      calls.reprice++
      preRepriceDue = state.reprice.nextListAt
      return null
    },
    lockDueMarkets: async () => {
      calls.lock++
      return 1
    },
    nextStartAfter: async () => {
      calls.next++
      return null
    },
    nextTrackedStartAfter: async () => null,
    pruneLiveQuotes: async () => 0,
    writeHeartbeat: async () => {
      calls.heartbeat++
    },
  }
  const runner = createWorkerRunner(base, io)
  return {
    runner,
    calls,
    rows,
    io,
    base,
    advance: (ms: number) => {
      now += ms
    },
    viewer: () => {
      changed = true
    },
    due: () => preRepriceDue,
  }
}

test("quiet cycles preserve upstream ticking without SQL, repricing or heartbeat writes", async () => {
  const f = fixture()
  await f.runner.step()
  assert.equal(f.calls.lock, 1)
  const before = { ...f.calls }
  f.advance(10_000)
  const result = await f.runner.step()
  assert.equal(result.quiet, true)
  assert.deepEqual(f.calls, before)
})
test("viewer wake clears quiet slate and forces immediate repricing discovery", async () => {
  const f = fixture()
  await f.runner.step()
  f.runner.state.reprice.nextListAt = Number.MAX_SAFE_INTEGER
  f.viewer()
  f.advance(31_000)
  const result = await f.runner.step()
  assert.equal(result.quiet, false)
  assert.equal(f.calls.load, 2)
  assert.equal(f.due(), 0)
})
test("a due kickoff exits quiet mode until locking succeeded", async () => {
  const f = fixture(5_000)
  await f.runner.step()
  f.advance(61_000)
  await f.runner.step()
  assert.equal(f.calls.lock, 2)
  assert.equal(f.calls.load, 2)
})
test("explicit wake invalidates discovery and bounded state forgets departed games", async () => {
  const f = fixture()
  await f.runner.step()
  f.runner.state.lastState.set("old", { key: "x", at: new Date() })
  f.runner.wake()
  f.rows.splice(0)
  f.rows.watched = true
  await f.runner.step()
  assert.equal(f.runner.state.lastState.has("old"), false)
  assert.equal(f.calls.next, 1)
})

test("wake forces a persisted snapshot after quiet observations changed", async () => {
  const f = fixture()
  let key = "first"
  f.io.tick = async (deps, state, date) => {
    const slate = await deps.store.loadSlate(date)
    if (state.lastState.get("game")?.key !== key) {
      await deps.store.insertQuotes([])
      state.lastState.set("game", { key, at: date })
    }
    return {
      slate: slate.length,
      okCalls: 1,
      failCalls: 0,
      skippedBackoff: 0,
      rowsWritten: 0,
      rowsSkipped: 0,
      matched: 0,
      unmatched: [],
      sources: {},
    }
  }
  await f.runner.step()
  assert.equal(f.calls.write, 1)
  key = "changed-during-quiet"
  f.advance(10000)
  await f.runner.step()
  assert.equal(f.calls.write, 1)
  assert.equal(f.runner.state.lastState.get("game")?.key, key)
  f.viewer()
  f.advance(31000)
  await f.runner.step()
  assert.equal(f.calls.write, 2)
})
test("checkpoint preserves Date/Map state and suppresses quiet SQL after isolate recovery", async () => {
  const f = fixture()
  await f.runner.step()
  f.advance(10000)
  await f.runner.step()
  const checkpoint = f.runner.checkpoint()
  const before = { ...f.calls }
  const restored = createWorkerRunner(f.base, { ...f.io, checkpoint })
  await restored.step()
  assert.deepEqual(f.calls, before)
  restored.wake()
  await restored.step()
  assert.equal(f.calls.load, before.load + 1)
})
test("oversized or incompatible recovery state fails closed", () => {
  const f = fixture()
  assert.throws(
    () =>
      createWorkerRunner(f.base, { ...f.io, checkpoint: "x".repeat(1000001) }),
    /bound/,
  )
  assert.throws(
    () => createWorkerRunner(f.base, { ...f.io, checkpoint: '{"version":9}' }),
    /Unsupported/,
  )
})

test("recovery clears transient settlement in-flight flags without resetting the poll budget", () => {
  const f = fixture()
  const input = {
    sport: "nba" as const,
    status: "final" as const,
    period: "4",
    clock: "0:00",
    homeScore: 100,
    awayScore: 90,
    bestMid: null,
  }
  const now = Date.parse("2026-10-23T20:00:00Z")
  assert.equal(
    f.runner.state.trigger.observe("game", input, now).fire,
    "status_final",
  )
  assert.equal(
    f.runner.state.trigger.observe("game", input, now + 21000).fire,
    null,
  )
  const restored = createWorkerRunner(f.base, {
    ...f.io,
    checkpoint: f.runner.checkpoint(),
  })
  assert.equal(
    restored.state.trigger.observe("game", input, now + 21000).fire,
    "status_final",
  )
  assert.equal(restored.state.trigger.snapshot()[0][1].active?.polls, 2)
})
