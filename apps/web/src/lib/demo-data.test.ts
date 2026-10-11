import assert from "node:assert/strict"
import { test } from "node:test"
import { DEMO_FANTASY_LEAGUES, DEMO_PEOPLE, FANTASY_START, SECURITIES, fantasyDayRange, fantasyEndsAt, fantasyHistory, fantasyIsComplete, makeRandom, type FantasyLeagueRow } from "./demo-data.ts"

const now = new Date("2026-10-11T12:00:00Z")

const wholeRows = (): FantasyLeagueRow[] =>
  DEMO_FANTASY_LEAGUES.map((l) => ({
    inviteCode: l.inviteCode,
    endsAt: fantasyEndsAt(l, now),
    members: l.players.length,
    positions: l.players.reduce((n, p) => n + p.picks.length, 0),
    trades: l.players.reduce((n, p) => n + p.picks.length, 0),
    snapshots: l.players.length * l.daysIn,
    mine: true,
  }))

test("every league has all five people once, valid picks and distinct invite codes", () => {
  const handles = DEMO_PEOPLE.map((p) => p.handle).sort()
  const securities = new Set(SECURITIES.map((s) => s.id))
  assert.equal(new Set(DEMO_FANTASY_LEAGUES.map((l) => l.inviteCode)).size, DEMO_FANTASY_LEAGUES.length)
  for (const league of DEMO_FANTASY_LEAGUES) {
    assert.deepEqual(league.players.map((p) => p.handle).sort(), handles)
    assert.ok(DEMO_PEOPLE.some((p) => p.handle === league.owner))
    for (const p of league.players) {
      assert.ok(p.cash > 0 && p.picks.length > 0)
      assert.ok(Math.abs(p.picks.reduce((n, [, w]) => n + w, 0) - 1) < 1e-9, `${league.name} ${p.handle} weights sum to 1`)
      for (const [id] of p.picks) assert.ok(securities.has(id))
      assert.ok(FANTASY_START * (1 + p.returnPct / 100) > p.cash, "has something invested")
    }
  }
})

test("theo ranks third in every league and returns stay plausible", () => {
  for (const league of DEMO_FANTASY_LEAGUES) {
    const ranked = [...league.players].sort((a, b) => b.returnPct - a.returnPct)
    assert.equal(ranked.findIndex((p) => p.handle === "theo"), 2, league.name)
    for (const p of ranked) assert.ok(p.returnPct > -10 && p.returnPct < 20)
  }
})

test("the set shows a running, a finished and an unlimited league", () => {
  assert.ok(DEMO_FANTASY_LEAGUES.some((l) => (l.endsInDays ?? 0) > 7))
  assert.ok(DEMO_FANTASY_LEAGUES.some((l) => (l.endsInDays ?? 0) < 0))
  assert.ok(DEMO_FANTASY_LEAGUES.some((l) => l.endsInDays === null))
  assert.equal(fantasyEndsAt(DEMO_FANTASY_LEAGUES.find((l) => l.endsInDays === null)!, now), null)
})

test("history covers daysIn days, starts near the stake and lands exactly on the final value", () => {
  for (const league of DEMO_FANTASY_LEAGUES) {
    const { firstDay, lastDay } = fantasyDayRange(league)
    for (const [i, p] of league.players.entries()) {
      const final = FANTASY_START * (1 + p.returnPct / 100)
      const history = fantasyHistory(league, final, makeRandom(league.seed * 31 + i))
      assert.equal(history.length, league.daysIn)
      assert.equal(history[0]!.daysAgo, firstDay)
      assert.equal(history.at(-1)!.daysAgo, lastDay)
      assert.equal(history.at(-1)!.value, final)
      assert.ok(Math.abs(history[0]!.value - FANTASY_START) < 1000)
    }
  }
})

test("a finished league's last snapshot falls on its end date, so it scores as shown", () => {
  const summer = DEMO_FANTASY_LEAGUES.find((l) => l.endsInDays! < 0)!
  assert.equal(fantasyDayRange(summer).lastDay, -summer.endsInDays!)
})

test("history is deterministic, so a healed seat matches the original", () => {
  const league = DEMO_FANTASY_LEAGUES[0]!
  const a = fantasyHistory(league, 102640, makeRandom(5))
  const b = fantasyHistory(league, 102640, makeRandom(5))
  assert.deepEqual(a, b)
})

test("complete when every league is whole and mine", () => {
  assert.equal(fantasyIsComplete(wholeRows(), now), true)
})

test("incomplete when a league is missing, the user has no seat, or a part is short", () => {
  assert.equal(fantasyIsComplete(wholeRows().slice(1), now), false)
  assert.equal(fantasyIsComplete(wholeRows().map((r, i) => (i === 0 ? { ...r, mine: false } : r)), now), false)
  for (const field of ["members", "positions", "trades", "snapshots"] as const) {
    assert.equal(fantasyIsComplete(wholeRows().map((r, i) => (i === 1 ? { ...r, [field]: r[field] - 1 } : r)), now), false, field)
  }
})

test("an extra signed-in user needs a sixth seat", () => {
  assert.equal(fantasyIsComplete(wholeRows(), now, true), false)
  assert.equal(fantasyIsComplete(wholeRows().map((r) => ({ ...r, members: r.members + 1 })), now, true), true)
})

test("a lapsed running league, or a reopened finished one, needs healing", () => {
  const rows = wholeRows()
  assert.equal(fantasyIsComplete(rows.map((r) => (r.inviteCode === "DEMO2345" ? { ...r, endsAt: new Date(now.getTime() - 1000) } : r)), now), false)
  assert.equal(fantasyIsComplete(rows.map((r) => (r.inviteCode === "DEMO4567" ? { ...r, endsAt: new Date(now.getTime() + 86_400_000) } : r)), now), false)
  assert.equal(fantasyIsComplete(rows.map((r) => (r.inviteCode === "DEMO5678" ? { ...r, endsAt: new Date(now.getTime() + 86_400_000) } : r)), now), false)
})
