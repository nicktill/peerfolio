import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { americanToDecimal, americanToProb, consensusTwoWay, devigTwoWay, priceTwoWay, probToAmerican, totalReturn } from "./odds.ts"
import { DEFAULT_PUBLISH, isPickWindowOpen, marketsToLock, planPublication } from "./lines.ts"
import { acceptPick, PickRejected, type PickContext, type PickRequest } from "./picks.ts"
import { gradePick, planSettlement, resolveResult, settleKey, type SettleablePick } from "./settlement.ts"
import { MockProvider } from "./providers/mock.ts"
import { normalizeOddsApiEvent } from "./providers/the-odds-api.ts"
import type { EventResult } from "./types.ts"

const NOW = new Date("2026-10-18T12:00:00Z")
const hours = (h: number) => new Date(NOW.getTime() + h * 3600_000)

describe("odds maths", () => {
  it("converts American odds", () => {
    assert.equal(americanToDecimal(100), 2)
    assert.equal(americanToDecimal(-200), 1.5)
    assert.ok(Math.abs(americanToProb(-110) - 0.5238) < 0.001)
    assert.equal(probToAmerican(0.5), -100)
  })

  it("devigs a symmetric market to 50%", () => {
    assert.ok(Math.abs(devigTwoWay(-110, -110) - 0.5) < 1e-9)
  })

  it("prices both sides with the margin, so a random player loses on average", () => {
    const [a, b] = priceTwoWay(0.5)!
    assert.ok(a < 0 && b < 0)
    const ev = Math.max(0.5 * americanToDecimal(a), 0.5 * americanToDecimal(b)) - 1
    assert.ok(ev < 0)
  })

  it("refuses lopsided markets", () => {
    assert.equal(priceTwoWay(0.97), null)
  })

  it("floors returns to whole credits", () => {
    assert.equal(totalReturn(100, -110), 190)
    assert.equal(totalReturn(33, 150), 82)
  })
})

describe("consensus", () => {
  const q = (book: string, price: number, point: number | null = null) => ({ book, price, point })

  it("takes the median and drops an outlier book", () => {
    const a = [q("1", -110), q("2", -112), q("3", -108), q("4", 150)]
    const b = [q("1", -110), q("2", -108), q("3", -112), q("4", -180)]
    const c = consensusTwoWay(a, b)!
    assert.equal(c.booksUsed, 3)
    assert.ok(Math.abs(c.fairProbA - 0.5) < 0.01)
  })

  it("returns null when too few books agree on the point", () => {
    const a = [q("1", -110, 44.5), q("2", -110, 45.5), q("3", -110, 46.5)]
    const b = [q("1", -110, 44.5), q("2", -110, 45.5), q("3", -110, 46.5)]
    assert.equal(consensusTwoWay(a, b), null)
  })

  it("requires books to quote both sides", () => {
    assert.equal(consensusTwoWay([q("1", -110), q("2", -110), q("3", -110)], [q("1", -110)]), null)
  })
})

describe("line publishing", () => {
  const snapshotAt = async (now: Date) => new MockProvider().fetchOdds("nfl", now)

  it("publishes game lines and props for NFL, none for tennis props", async () => {
    const nfl = planPublication(await snapshotAt(NOW), NOW, new Set())
    assert.ok(nfl.drafts.some((d) => d.kind === "player_prop"))
    assert.ok(nfl.drafts.some((d) => d.kind === "spread"))
    const tennis = planPublication(await new MockProvider().fetchOdds("tennis", NOW), NOW, new Set())
    assert.ok(tennis.drafts.length > 0)
    assert.ok(tennis.drafts.every((d) => d.kind === "moneyline" || d.kind === "total"))
  })

  it("is idempotent: published markets are never republished or moved", async () => {
    const snap = await snapshotAt(NOW)
    const first = planPublication(snap, NOW, new Set())
    const published = new Set(first.drafts.map((d) => `${d.externalEventId}::${d.marketKey}`))
    assert.equal(planPublication(snap, NOW, published).drafts.length, 0)
  })

  it("rejects a stale snapshot", async () => {
    const snap = await snapshotAt(new Date(NOW.getTime() - DEFAULT_PUBLISH.maxSnapshotAgeMs - 1))
    const plan = planPublication(snap, NOW, new Set())
    assert.equal(plan.rejected, "stale_snapshot")
    assert.equal(plan.drafts.length, 0)
  })

  it("skips markets that would open for too little time", async () => {
    const snap = await snapshotAt(NOW)
    snap.events[0]!.startsAt = hours(1.2)
    const plan = planPublication(snap, NOW, new Set())
    assert.ok(!plan.drafts.some((d) => d.externalEventId === snap.events[0]!.externalId))
  })

  it("locks props earlier than games", async () => {
    const plan = planPublication(await snapshotAt(NOW), NOW, new Set())
    const game = plan.drafts.find((d) => d.kind === "moneyline")!
    const prop = plan.drafts.find((d) => d.kind === "player_prop" && d.externalEventId === game.externalEventId)!
    assert.ok(prop.lockAt.getTime() < game.lockAt.getTime())
  })

  it("spread sides carry opposite points", async () => {
    const plan = planPublication(await snapshotAt(NOW), NOW, new Set())
    const spread = plan.drafts.find((d) => d.kind === "spread")!
    assert.equal(spread.lines[0].point, -spread.lines[1].point!)
  })
})

describe("locking", () => {
  const market = { status: "open", lockAt: hours(1) }
  it("is open before lockAt and shut at and after it", () => {
    assert.equal(isPickWindowOpen(market, "scheduled", NOW), true)
    assert.equal(isPickWindowOpen(market, "scheduled", hours(1)), false)
    assert.equal(isPickWindowOpen(market, "scheduled", hours(2)), false)
  })
  it("is shut when the event is postponed or the market is not open", () => {
    assert.equal(isPickWindowOpen(market, "postponed", NOW), false)
    assert.equal(isPickWindowOpen({ ...market, status: "void" }, "scheduled", NOW), false)
  })
  it("selects open markets whose lock time has passed", () => {
    const ms = [market, { status: "open", lockAt: hours(-1) }, { status: "locked", lockAt: hours(-1) }]
    assert.equal(marketsToLock(ms, NOW).length, 1)
  })
})

describe("pick caps and snapshot", () => {
  const ctx = (over: Partial<PickContext> = {}): PickContext => ({
    now: NOW,
    market: { id: "m1", status: "open", lockAt: hours(2) },
    eventStatus: "scheduled",
    line: { id: "l1", marketId: "m1", price: -110, point: -3.5 },
    member: { credits: 1000 },
    league: { startingCredits: 1000 },
    picksOnMarket: 0,
    openPickCount: 0,
    openStakeTotal: 0,
    ...over,
  })
  const req = (over: Partial<PickRequest> = {}): PickRequest => ({ stake: 50, lineId: "l1", expectedPrice: -110, expectedPoint: -3.5, ...over })
  const code = (fn: () => unknown) => {
    try {
      fn()
    } catch (e) {
      return (e as PickRejected).code
    }
    return null
  }

  it("accepts and snapshots the line with a server timestamp", () => {
    const p = acceptPick(req(), ctx())
    assert.deepEqual([p.stake, p.price, p.point, p.totalReturn], [50, -110, -3.5, 95])
    assert.equal(p.acceptedAt, NOW)
  })
  it("refuses when the client's line is stale rather than re-pricing", () => {
    assert.equal(code(() => acceptPick(req({ expectedPrice: -105 }), ctx())), "line_mismatch")
    assert.equal(code(() => acceptPick(req({ expectedPoint: -4.5 }), ctx())), "line_mismatch")
  })
  it("refuses after lock", () => {
    assert.equal(code(() => acceptPick(req(), ctx({ now: hours(3) }))), "market_closed")
  })
  it("refuses fractional, zero and negative stakes", () => {
    for (const stake of [0, -5, 10.5, Number.NaN]) assert.equal(code(() => acceptPick(req({ stake }), ctx())), "invalid_stake")
  })
  it("enforces min and max stake", () => {
    assert.equal(code(() => acceptPick(req({ stake: 5 }), ctx())), "stake_too_small")
    assert.equal(code(() => acceptPick(req({ stake: 101 }), ctx())), "stake_too_large")
  })
  it("refuses more than the balance", () => {
    assert.equal(code(() => acceptPick(req(), ctx({ member: { credits: 20 } }))), "insufficient_credits")
  })
  it("allows one pick per market (no hedging both sides)", () => {
    assert.equal(code(() => acceptPick(req(), ctx({ picksOnMarket: 1 }))), "already_picked")
  })
  it("caps open picks and total exposure", () => {
    assert.equal(code(() => acceptPick(req(), ctx({ openPickCount: 20 }))), "too_many_picks")
    assert.equal(code(() => acceptPick(req({ stake: 100 }), ctx({ openStakeTotal: 520 }))), "too_much_exposure")
  })
  it("caps the winnings of a single longshot", () => {
    assert.equal(code(() => acceptPick(req({ stake: 100, expectedPrice: 900 }), ctx({ line: { id: "l1", marketId: "m1", price: 900, point: -3.5 } }))), "return_too_large")
  })
  it("rejects a line from another market", () => {
    assert.equal(code(() => acceptPick(req(), ctx({ line: { id: "l1", marketId: "other", price: -110, point: -3.5 } }))), "line_mismatch")
  })
})

describe("grading", () => {
  const res = (h: number, a: number, extra: Partial<EventResult> = {}): EventResult => ({
    source: "s",
    externalId: "e",
    status: "final",
    homeScore: h,
    awayScore: a,
    ...extra,
  })
  const line = (over: object) => ({ kind: "moneyline" as const, selection: "home" as const, point: null, player: null, statKey: null, ...over })

  it("grades moneylines and pushes ties", () => {
    assert.equal(gradePick(line({}), res(24, 20)), "win")
    assert.equal(gradePick(line({ selection: "away" }), res(24, 20)), "loss")
    assert.equal(gradePick(line({}), res(20, 20)), "push")
  })
  it("grades spreads from the picked side's handicap, pushing on the number", () => {
    assert.equal(gradePick(line({ kind: "spread", point: -3.5 }), res(24, 20)), "win")
    assert.equal(gradePick(line({ kind: "spread", point: -3.5 }), res(23, 20)), "loss")
    assert.equal(gradePick(line({ kind: "spread", point: -3 }), res(23, 20)), "push")
    assert.equal(gradePick(line({ kind: "spread", selection: "away", point: 3.5 }), res(23, 20)), "win")
  })
  it("grades totals", () => {
    assert.equal(gradePick(line({ kind: "total", selection: "over", point: 44.5 }), res(24, 21)), "win")
    assert.equal(gradePick(line({ kind: "total", selection: "under", point: 44.5 }), res(24, 21)), "loss")
    assert.equal(gradePick(line({ kind: "total", selection: "over", point: 45 }), res(24, 21)), "push")
  })
  it("grades props from box scores and voids when the player is missing", () => {
    const p = line({ kind: "player_prop", selection: "over", point: 249.5, player: "QB One", statKey: "player_pass_yds" })
    assert.equal(gradePick(p, res(1, 0, { playerStats: { "QB One": { player_pass_yds: 260 } } })), "win")
    assert.equal(gradePick(p, res(1, 0, { playerStats: { "QB One": { player_pass_yds: 249.5 } } })), "push")
    assert.equal(gradePick(p, res(1, 0, { playerStats: {} })), "void")
    assert.equal(gradePick(p, res(1, 0)), "void")
  })
  it("voids anything that is not a completed game", () => {
    assert.equal(gradePick(line({}), res(0, 0, { status: "postponed", homeScore: null, awayScore: null })), "void")
  })
})

describe("result resolution", () => {
  const base = { status: "final" as const, externalId: "e", homeScore: 10, awayScore: 7 }
  const A: EventResult = { ...base, source: "a" }
  const B: EventResult = { ...base, source: "b" }
  const ctx = { now: NOW, startsAt: hours(-5), finalFirstSeenAt: hours(-7) }

  it("settles when two sources agree and the delay has passed", () => {
    assert.equal(resolveResult([A, B], ctx).kind, "final")
  })
  it("waits for a second source", () => {
    assert.equal(resolveResult([A], ctx).kind, "wait")
    assert.equal(resolveResult([A, { ...A }], ctx).kind, "wait") // same source twice does not count
  })
  it("waits out the settle delay (stat corrections)", () => {
    assert.equal(resolveResult([A, B], { ...ctx, finalFirstSeenAt: hours(-1) }).kind, "wait")
    assert.equal(resolveResult([A, B], { ...ctx, finalFirstSeenAt: null }).kind, "wait")
  })
  it("sends disagreements to review", () => {
    assert.equal(resolveResult([A, { ...B, homeScore: 11 }], ctx).kind, "review")
  })
  it("voids cancelled and retired events", () => {
    assert.equal(resolveResult([{ ...A, status: "cancelled" }], ctx).kind, "void")
    assert.equal(resolveResult([{ ...A, status: "retired" }], ctx).kind, "void")
  })
  it("waits on a fresh postponement then voids after the grace period", () => {
    const pp: EventResult = { ...A, status: "postponed", homeScore: null, awayScore: null }
    assert.equal(resolveResult([pp], { ...ctx, startsAt: hours(-5) }).kind, "wait")
    assert.equal(resolveResult([pp], { ...ctx, startsAt: hours(-72) }).kind, "void")
  })
  it("flags conflicting player stats", () => {
    const sa = { ...A, playerStats: { P: { s: 1 } } }
    const sb = { ...B, playerStats: { P: { s: 2 } } }
    assert.equal(resolveResult([sa, sb], ctx).kind, "review")
  })
})

describe("settlement plan", () => {
  const picks: SettleablePick[] = [
    { id: "w", memberId: "m", status: "open", stake: 100, totalReturn: 190 },
    { id: "l", memberId: "m", status: "open", stake: 100, totalReturn: 190 },
    { id: "p", memberId: "m", status: "open", stake: 40, totalReturn: 76 },
    { id: "v", memberId: "m", status: "open", stake: 25, totalReturn: 47 },
  ]
  const outcomes = new Map([["w", "win"], ["l", "loss"], ["p", "push"], ["v", "void"]] as const)

  it("pays wins the snapshotted return, refunds pushes and voids, and writes nothing for losses", () => {
    const plan = planSettlement(picks, outcomes, new Set())
    assert.deepEqual(plan.ledger.map((e) => [e.pickId, e.type, e.amount]), [
      ["w", "settle_win", 190],
      ["p", "settle_refund", 40],
      ["v", "settle_refund", 25],
    ])
    assert.deepEqual(plan.statuses.map((s) => s.status), ["won", "lost", "push", "void"])
  })

  it("is idempotent: already-settled picks and existing ledger keys produce no writes", () => {
    const first = planSettlement(picks, outcomes, new Set())
    const settled = picks.map((p) => ({ ...p, status: "won" as const }))
    assert.equal(planSettlement(settled, outcomes, new Set(first.ledger.map((e) => e.idempotencyKey))).ledger.length, 0)
    // even if status were still open (crashed mid-way), the key blocks a double payout
    const replay = planSettlement(picks, outcomes, new Set([settleKey("w")]))
    assert.ok(!replay.ledger.some((e) => e.pickId === "w"))
  })

  it("never double-credits when the same pick appears twice in one run", () => {
    const plan = planSettlement([picks[0]!], outcomes, new Set())
    assert.equal(plan.ledger.length, 1)
  })
})

describe("the-odds-api normalisation", () => {
  const raw = {
    id: "abc",
    commence_time: "2026-10-25T17:00:00Z",
    home_team: "Chiefs",
    away_team: "Bills",
    bookmakers: [
      {
        key: "bk1",
        markets: [
          { key: "h2h", outcomes: [{ name: "Chiefs", price: -140 }, { name: "Bills", price: 120 }] },
          { key: "spreads", outcomes: [{ name: "Chiefs", price: -110, point: -2.5 }, { name: "Bills", price: -110, point: 2.5 }] },
          { key: "totals", outcomes: [{ name: "Over", price: -110, point: 47.5 }, { name: "Under", price: -110, point: 47.5 }] },
          { key: "player_pass_yds", outcomes: [{ name: "Over", description: "P Mahomes", price: -115, point: 275.5 }, { name: "Under", description: "P Mahomes", price: -105, point: 275.5 }] },
          { key: "unknown_market", outcomes: [{ name: "x", price: 100 }] },
        ],
      },
    ],
  }
  it("maps h2h, spreads, totals and props to neutral markets", () => {
    const e = normalizeOddsApiEvent(raw, "nfl")
    assert.deepEqual(e.markets.map((m) => m.key), ["moneyline", "spread", "total", "player_pass_yds"])
    assert.equal(e.markets[3]!.player, "P Mahomes")
    assert.equal(e.markets[1]!.outcomes.find((o) => o.selection === "away")!.quotes[0]!.point, 2.5)
    assert.equal(e.startsAt.toISOString(), "2026-10-25T17:00:00.000Z")
  })
})
