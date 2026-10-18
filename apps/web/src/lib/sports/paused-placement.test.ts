import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { assertSportsPickable, placeSportsParlay, placeSportsPick, SportsError, type Db } from "./store.ts"

const LEAGUE = "00000000-0000-4000-8000-000000000001"
const NOW = new Date("2026-10-18T12:00:00Z")
const saved = process.env.SPORTS_DISABLED
afterEach(() => {
  if (saved === undefined) delete process.env.SPORTS_DISABLED
  else process.env.SPORTS_DISABLED = saved
})

/** A drizzle stand-in: every select chain resolves to the next staged result, execute() to the staged member row. */
function fakeDb(selects: unknown[][]): Db {
  const queue = [...selects]
  const chain = (): unknown => {
    const result = queue.shift() ?? []
    const proxy: unknown = new Proxy(() => {}, {
      get: (_t, prop) => (prop === "then" ? (resolve: (v: unknown) => void) => resolve(result) : () => proxy),
    })
    return proxy
  }
  const tx = { select: chain, execute: async () => [{ id: "member-1", credits: 1000 }] }
  return { transaction: async (fn: (t: unknown) => unknown) => fn(tx) } as unknown as Db
}

const league = { id: LEAGUE, sports: ["nfl", "tennis"], endsAt: null, startingCredits: 1000 }
const tennisEvent = { id: "event-1", sport: "tennis", status: "scheduled", startsAt: new Date(NOW.getTime() + 3600_000) }
const market = { id: "market-1", eventId: "event-1", marketKey: "moneyline", status: "open", kind: "moneyline", player: null, lockAt: new Date(NOW.getTime() + 1800_000) }

describe("a paused sport takes no new picks", () => {
  it("assertSportsPickable names the sport and uses 409", () => {
    delete process.env.SPORTS_DISABLED
    assert.throws(() => assertSportsPickable(["nfl", "tennis"]), (e: unknown) => e instanceof SportsError && e.message === "Tennis is paused" && e.status === 409)
    assert.doesNotThrow(() => assertSportsPickable(["nfl", "nba"]))
    process.env.SPORTS_DISABLED = ""
    assert.doesNotThrow(() => assertSportsPickable(["tennis"]))
  })

  it("rejects a single pick on a tennis line with 'Tennis is paused'", async () => {
    delete process.env.SPORTS_DISABLED
    const db = fakeDb([[{ marketId: market.id }], [market], [{ id: "line-1", marketId: market.id, price: -110, point: null, selection: "home" }], [], [league], [tennisEvent]])
    await assert.rejects(
      placeSportsPick(db, "user-1", LEAGUE, { lineId: "line-1", stake: 50, expectedPrice: -110, requestId: "r1" } as never, NOW),
      (e: unknown) => e instanceof SportsError && e.message === "Tennis is paused" && e.status === 409,
    )
  })

  it("rejects a parlay with a tennis leg", async () => {
    delete process.env.SPORTS_DISABLED
    const lines = [{ id: "line-1", marketId: market.id }, { id: "line-2", marketId: market.id }]
    const db = fakeDb([lines, [market], lines, [], [league], [tennisEvent]])
    await assert.rejects(
      placeSportsParlay(db, "user-1", LEAGUE, { legs: [{ lineId: "line-1" }, { lineId: "line-2" }], stake: 20, requestId: "r2" } as never, NOW),
      (e: unknown) => e instanceof SportsError && e.message === "Tennis is paused" && e.status === 409,
    )
  })

  it("lets the pick through the paused check when SPORTS_DISABLED is empty", async () => {
    process.env.SPORTS_DISABLED = ""
    const db = fakeDb([[{ marketId: market.id }], [market], [{ id: "line-1", marketId: market.id, price: -110, point: null, selection: "home" }], [], [league], [tennisEvent]])
    const outcome = await placeSportsPick(db, "user-1", LEAGUE, { lineId: "line-1", stake: 50, expectedPrice: -110, requestId: "r3" } as never, NOW).then(() => null, (e: unknown) => e)
    assert.ok(!(outcome instanceof Error) || !/paused/.test(outcome.message))
  })
})
