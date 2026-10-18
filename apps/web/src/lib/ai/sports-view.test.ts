import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { shapeSports, type SportsLeagueLike } from "./sports-view.ts"

const now = new Date("2026-10-18T18:00:00Z")
const ev = (startsAt: string) => ({ sport: "nfl", home: "Bills", away: "Jets", startsAt })
const data = {
  league: { name: "Sunday", sports: ["nfl"], startingCredits: 1000, maxStakePct: 10, liveBetting: true, endsAt: null, inviteCode: "SECRET" },
  you: { credits: 700 },
  limits: { minStake: 10, maxStake: 100, maxOpenPicks: 20 },
  standings: [
    { name: "Ana", record: { won: 3, lost: 1 }, credits: 1200, isYou: false },
    { name: "Me", record: { won: 1, lost: 1 }, credits: 1000, isYou: true },
  ],
  markets: [{ kind: "moneyline", lockAt: "2026-10-19T17:00:00Z", event: ev("2026-10-19T17:00:00Z"), lines: [{ selection: "home", price: -150 }, { selection: "away", price: 130 }] }],
  picks: [{ selection: "home", stake: 100, price: -150, totalReturn: 166, status: "open", market: { kind: "moneyline" }, event: ev("2026-10-19T17:00:00Z") }, { selection: "away", stake: 50, price: 110, totalReturn: 105, status: "won", payout: 105, market: { kind: "moneyline" }, event: ev("2026-10-10T17:00:00Z") }],
  leaguePicks: [
    { name: "Ana", selection: "away", stake: 80, price: 130, status: "open", event: ev("2026-10-18T17:00:00Z"), market: { kind: "moneyline" } },
    { name: "Ben", selection: "home", stake: 80, price: -150, status: "open", event: ev("2026-10-19T17:00:00Z"), market: { kind: "moneyline" } },
    { name: "Me", you: true, selection: "home", stake: 5, status: "lost", event: ev("2026-10-10T17:00:00Z") },
  ],
  leagueParlays: [
    { name: "Cy", stake: 20, status: "open", legs: [{ event: ev("2026-10-18T17:00:00Z") }, { event: ev("2026-10-19T17:00:00Z") }] },
    { name: "Di", stake: 20, status: "lost", legs: [{ event: ev("2026-10-10T17:00:00Z"), selection: "home" }] },
  ],
} as unknown as SportsLeagueLike

describe("shapeSports", () => {
  const v = shapeSports(data, now)
  it("computes cash, at-risk and rank", () => {
    assert.equal(v.you.cash, 700)
    assert.equal(v.you.atRisk, 100)
    assert.equal(v.you.totalValue, 800)
    assert.equal(v.you.rank, 2)
    assert.equal(v.you.gapToLeader, -200)
  })
  it("never passes on other members' open picks before kickoff, nor invite codes", () => {
    const t = JSON.stringify(v)
    assert.ok(!t.includes("Ben") && !t.includes("Cy") && !t.includes("SECRET"))
    assert.deepEqual(v.othersLockedPicks.map((p) => p.member), ["Ana"])
    assert.deepEqual(v.othersParlays.map((p) => p.member), ["Di"])
  })
  it("works with no parlay data at all", () => {
    const bare = shapeSports({ league: { name: "x" } }, now)
    assert.deepEqual(bare.yourParlays, [])
    assert.equal(bare.you.rank, null)
    assert.equal(bare.openLines.games, 0)
  })
  it("summarises open lines compactly", () => {
    assert.equal(v.openLines.games, 1)
    assert.equal(v.openLines.moneylines[0]!.lines[0]!.americanOdds, -150)
  })
})
