import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { isPickWindowOpen } from "../lines.ts"
import { totalReturn } from "../odds.ts"
import { acceptPick, PickRejected, type PickContext, type PickRequest } from "../picks.ts"
import { gradePick, planSettlement } from "../settlement.ts"
import { buildLiveView } from "./view.ts"

const here = dirname(fileURLToPath(import.meta.url))
const sports = join(here, "..")
const NOW = new Date("2026-10-18T17:00:00Z")
const START = new Date("2026-10-18T18:00:00Z")
const at = (ms: number) => new Date(START.getTime() + ms)

const ctx = (over: Partial<PickContext> = {}): PickContext => ({
  now: at(-30 * 60_000),
  // A lock set late on purpose (after kickoff): the start-time gate alone must still close the market.
  market: { id: "m1", status: "open", lockAt: at(60 * 60_000) },
  eventStatus: "scheduled",
  eventStartsAt: START,
  line: { id: "l1", marketId: "m1", price: -150, point: null },
  member: { credits: 1000 },
  league: { startingCredits: 1000 },
  picksOnMarket: 0,
  openPickCount: 0,
  openStakeTotal: 0,
  ...over,
})
const req = (over: Partial<PickRequest> = {}): PickRequest => ({ stake: 60, lineId: "l1", expectedPrice: -150, expectedPoint: null, ...over })
const rejects = (fn: () => unknown) => {
  try {
    fn()
  } catch (e) {
    return e instanceof PickRejected ? e.code : "other"
  }
  return null
}

describe("picks close at kickoff, enforced on the server", () => {
  it("accepts before kickoff and refuses at the instant of kickoff even if the market lock is later", () => {
    assert.ok(acceptPick(req(), ctx({ now: at(-1) })))
    assert.equal(rejects(() => acceptPick(req(), ctx({ now: at(0) }))), "market_closed")
    assert.equal(rejects(() => acceptPick(req(), ctx({ now: at(5 * 60_000) }))), "market_closed")
  })
  it("the earlier of market lock and kickoff wins", () => {
    // Lock before kickoff (the normal cushion) still closes first.
    const early = ctx({ now: at(-10 * 60_000), market: { id: "m1", status: "open", lockAt: at(-20 * 60_000) } })
    assert.equal(rejects(() => acceptPick(req(), early)), "market_closed")
  })
  it("refuses once the event is no longer scheduled, whatever the clock says", () => {
    assert.equal(rejects(() => acceptPick(req(), ctx({ now: at(-60_000), eventStatus: "postponed" }))), "market_closed")
  })
  it("isPickWindowOpen only consults the supplied server clock and start", () => {
    const m = { status: "open", lockAt: at(3600_000) }
    assert.equal(isPickWindowOpen(m, "scheduled", at(-1), START), true)
    assert.equal(isPickWindowOpen(m, "scheduled", at(0), START), false)
    // Without a start time the old behaviour is unchanged (callers that omit it keep the lock-only rule).
    assert.equal(isPickWindowOpen(m, "scheduled", at(0)), true)
  })
  it("a live win probability cannot reopen a closed market: the context has no live input at all", () => {
    const live = buildLiveView({ eventId: "e", eventStatus: "scheduled", quotes: [], state: null }, NOW)
    assert.ok(live)
    assert.equal(rejects(() => acceptPick(req(), ctx({ now: at(10 * 60_000) }))), "market_closed")
    assert.ok(!("live" in ctx()))
  })
})

describe("accepted picks keep their accepted price and payout, never repriced from live quotes", () => {
  it("the accepted payout is a pure function of stake and the accepted line", () => {
    const accepted = acceptPick(req(), ctx({ now: at(-60_000) }))
    assert.equal(accepted.price, -150)
    assert.equal(accepted.totalReturn, totalReturn(60, -150))
  })
  it("settlement pays the stored totalReturn whatever the market says now", () => {
    const pick = { id: "p1", memberId: "mem", status: "open" as const, stake: 60, totalReturn: 100 }
    // The exchange may say 5% or 95% right now. Neither number is an input to settlement: it takes picks and outcomes only.
    const plan = planSettlement([pick], new Map([["p1", "win" as const]]), new Set())
    assert.equal(plan.ledger.find((l) => l.pickId === "p1")?.amount, 100)
    assert.equal(planSettlement.length, 3)
  })
  it("grading uses only the final result from the results feed", () => {
    const line = { kind: "moneyline" as const, selection: "home" as const, point: null, sport: "nba", player: null, statKey: null }
    assert.equal(gradePick(line, { source: "espn", externalId: "1", status: "final", homeScore: 100, awayScore: 99 }), "win")
    // A game still in progress is never graded, however lopsided the live odds look.
    assert.equal(gradePick(line, { source: "espn", externalId: "1", status: "in_progress", homeScore: 100, awayScore: 10 }), "void")
  })
})

/** Source-level guard: the money path and the live layer must stay disconnected. */
describe("the live layer is disconnected from picks, pricing and settlement", () => {
  const src = (p: string) => readFileSync(join(sports, p), "utf8")
  const importsOf = (code: string) => [...code.matchAll(/(?:from|import)\s+["']([^"']+)["']/g)].map((m) => m[1]!)

  it("money-path modules never import anything from live/", () => {
    for (const f of ["picks.ts", "odds.ts", "lines.ts", "settlement.ts", "store.ts", "credit-budget.ts", "providers/composite.ts", "providers/espn.ts", "providers/the-odds-api.ts"]) {
      const bad = importsOf(src(f)).filter((i) => /(^|\/)live(\/|$)/.test(i))
      assert.deepEqual(bad, [], `${f} must not depend on the live layer`)
    }
  })
  it("live modules never import picks, pricing, settlement or the sports store", () => {
    for (const f of readdirSync(here).filter((x) => x.endsWith(".ts") && !x.endsWith(".test.ts"))) {
      const bad = importsOf(readFileSync(join(here, f), "utf8")).filter((i) => /\.\.\/(picks|odds|lines|settlement|store|credit-budget|api)(\.ts)?$/.test(i) || /\/providers\//.test(i))
      assert.deepEqual(bad, [], `live/${f} must not depend on the money path`)
    }
  })
  it("live store code never names the picks, lines, markets or ledger tables", () => {
    const code = src("live/store.ts")
    for (const t of ["sportsPicks", "sportsLines", "sportsMarkets", "sportsLedger", "sportsMembers"]) assert.ok(!code.includes(t), `live/store.ts mentions ${t}`)
  })
})
