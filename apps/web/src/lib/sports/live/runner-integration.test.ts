import { test } from "node:test"
import assert from "node:assert/strict"
import { createWorkerRunner, type RunnerIO } from "./runner.ts"
import type { WorkerDeps } from "./worker.ts"
import type { LiveSlate, QuoteInsert } from "./store.ts"
import type { LiveGameState } from "./types.ts"

test("real poll cycle preserves active, quiet, viewer wake, restart and final settlement behavior", async () => {
  let now = Date.parse("2026-10-23T20:00:00Z"),
    watched = false,
    changed = false,
    ended = false,
    score = "50-54"
  const rows = Object.assign(
    [
      {
        id: "bos",
        externalId: "x1",
        sport: "nba",
        status: "scheduled",
        startsAt: new Date(now - 3600000),
        homeName: "Boston Celtics",
        awayName: "Detroit Pistons",
      },
    ],
    { watched: false },
  ) as LiveSlate
  const quotes: QuoteInsert[] = []
  const states: LiveGameState[] = []
  let locks = 0,
    reprices = 0,
    settles = 0,
    loads = 0
  const base: WorkerDeps = {
    store: {
      loadSlate: async () => {
        loads++
        rows.watched = watched
        return rows
      },
      insertQuotes: async (r) => {
        quotes.push(...r)
      },
      upsertState: async (_id, s) => {
        states.push(s)
      },
    },
    getJson: async (url) =>
      url.includes("gamma-api")
        ? [
            {
              slug: "nba-det-bos",
              title: "Pistons vs. Celtics",
              live: !ended,
              ended,
              score,
              period: ended ? "Final" : "Q2",
              elapsed: "05:12",
              startTime: rows[0].startsAt.toISOString(),
              markets: [
                {
                  sportsMarketType: "moneyline",
                  outcomes: '["Pistons","Celtics"]',
                  clobTokenIds: '["det","bos"]',
                  acceptingOrders: true,
                },
              ],
            },
          ]
        : { events: [] },
    postJson: async (_url, body) =>
      (body as { token_id: string }[]).map(({ token_id }) => ({
        asset_id: token_id,
        timestamp: String(now - 500),
        bids: [{ price: token_id === "bos" ? "0.54" : "0.44" }],
        asks: [{ price: token_id === "bos" ? "0.56" : "0.46" }],
      })),
    reprice: {
      listTargets: async () => {
        reprices++
        return []
      },
      apply: async () => {
        throw Error("Unexpected apply")
      },
      freeze: async () => true,
      reopen: async () => true,
      confirm: async () => {},
      lastActivity: async () => null,
    },
    triggerSettle: async () => {
      settles++
      return { done: true }
    },
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
    lockDueMarkets: async () => {
      locks++
      return 1
    },
    nextStartAfter: async () => null,
    nextTrackedStartAfter: async () => null,
    pruneLiveQuotes: async () => 0,
    writeHeartbeat: async () => {},
  }
  let runner = createWorkerRunner(base, io)
  await runner.step()
  assert.equal(quotes.length, 2)
  assert.equal(states.at(-1)?.homeScore, 54)
  assert.equal(locks, 1)
  assert.equal(reprices, 1)
  const persisted = quotes.length
  now += 10000
  score = "50-60"
  await runner.step()
  assert.equal(quotes.length, persisted)
  assert.equal(loads, 1)
  assert.equal(states.at(-1)?.homeScore, 54)
  now += 31000
  changed = true
  watched = true
  await runner.step()
  assert.equal(quotes.length, persisted + 2)
  assert.equal(states.at(-1)?.homeScore, 60)
  assert.equal(reprices, 2)
  const checkpoint = runner.checkpoint()
  runner = createWorkerRunner(base, { ...io, checkpoint })
  assert.equal(runner.checkpoint(), checkpoint)
  now += 31000
  ended = true
  await runner.step()
  await Promise.resolve()
  assert.equal(states.at(-1)?.status, "final")
  assert.equal(settles, 1)
  assert.equal(locks, 2)
})
