import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { DEFAULT_PUBLISH, kindsFor, planPublication } from "./lines.ts"
import { gradePick } from "./settlement.ts"
import { SPORTS } from "./types.ts"
import { PROP_MARKETS } from "./providers/the-odds-api.ts"
import { MockProvider } from "./providers/mock.ts"
import { ESPN_PATH, KALSHI_SERIES, POLYMARKET_SERIES } from "./live/sources.ts"
import { liveSlate } from "./live/plan.ts"
import { matchGame, normName, sameTeam, sameTeamLoose } from "./live/match.ts"
import { marketTitle, SPORT_LABEL } from "./format.ts"
import { teamLook } from "./teams.ts"

const final = (h: number, a: number) => ({ source: "t", externalId: "x", status: "final" as const, homeScore: h, awayScore: a })
const ml = (sport: string, selection: "home" | "away") => ({ sport, kind: "moneyline" as const, selection, point: null, player: null, statKey: null })

describe("nhl, mlb, cfb, mls config", () => {
  it("lists every sport once", () => {
    assert.deepEqual([...SPORTS], ["nfl", "nba", "tennis", "nhl", "mlb", "cfb", "mls"])
  })
  it("kindsFor per sport", () => {
    assert.deepEqual(kindsFor("nhl", DEFAULT_PUBLISH), ["moneyline", "spread", "total"])
    assert.deepEqual(kindsFor("mlb", DEFAULT_PUBLISH), ["moneyline", "spread", "total"])
    assert.deepEqual(kindsFor("cfb", DEFAULT_PUBLISH), ["moneyline", "spread", "total"])
    assert.deepEqual(kindsFor("mls", DEFAULT_PUBLISH), ["spread", "total"])
    assert.deepEqual(kindsFor("nfl", DEFAULT_PUBLISH), ["moneyline", "spread", "total", "player_prop"])
  })
  it("has no props for the new sports and keys everywhere", () => {
    for (const s of ["nhl", "mlb", "cfb", "mls"] as const) {
      assert.deepEqual(PROP_MARKETS[s], [])
      assert.ok(ESPN_PATH[s] && KALSHI_SERIES[s] && POLYMARKET_SERIES[s] && SPORT_LABEL[s])
    }
    assert.equal(ESPN_PATH.mls, "soccer/usa.1")
    assert.equal(KALSHI_SERIES.cfb, "KXNCAAFGAME")
    assert.equal(POLYMARKET_SERIES.nhl, "10346")
  })
  it("publishes only the allowed kinds from the mock provider", async () => {
    const now = new Date("2026-10-17T12:00:00Z")
    for (const sport of ["nhl", "mlb", "cfb", "mls"] as const) {
      const ev = new MockProvider()
      const snap = await ev.fetchOdds(sport, now)
      const plan = planPublication(snap, now, new Set())
      const kinds = new Set(plan.drafts.map((m) => m.kind))
      for (const k of kinds) assert.ok(kindsFor(sport, DEFAULT_PUBLISH).includes(k as never), `${sport} published ${k}`)
      if (sport === "mls") assert.ok(!kinds.has("moneyline"))
    }
  })
  it("live slate window per sport", () => {
    const start = new Date("2026-10-17T00:00:00Z")
    const ev = (sport: string) => ({ id: sport, sport, status: "scheduled", startsAt: start, homeName: "a", awayName: "b" })
    const at = (h: number) => new Date(start.getTime() + h * 3600_000)
    assert.equal(liveSlate([ev("mls")], at(2.9)).length, 1)
    assert.equal(liveSlate([ev("mls")], at(3.1)).length, 0)
    assert.equal(liveSlate([ev("nhl")], at(4.1)).length, 0)
    assert.equal(liveSlate([ev("mlb")], at(4.9)).length, 1)
    assert.equal(liveSlate([ev("cfb")], at(5.1)).length, 0)
  })
  it("labels totals by sport", () => {
    const t = (sport: string) => marketTitle({ kind: "total", event: { sport } } as never)
    assert.equal(t("nhl"), "Total goals")
    assert.equal(t("mls"), "Total goals")
    assert.equal(t("mlb"), "Total runs")
    assert.equal(t("cfb"), "Total points")
  })
  it("team look is safe for unknown sports", () => {
    assert.equal(teamLook("nhl", "Boston Bruins").logo, null)
    assert.equal(teamLook("mls", "Inter Miami CF").abbr, "IC")
  })
})

describe("grading ties", () => {
  const r = final(3, 3)
  it("nhl, mlb, nba and tennis moneyline ties void", () => {
    for (const s of ["nhl", "mlb", "nba", "tennis", "mls"]) assert.equal(gradePick(ml(s, "home"), r), "void", s)
  })
  it("football ties push, and no sport keeps behaving as before", () => {
    assert.equal(gradePick(ml("nfl", "home"), r), "push")
    assert.equal(gradePick(ml("cfb", "home"), r), "push")
    assert.equal(gradePick({ ...ml("", "home"), sport: undefined }, r), "push")
  })
  it("hockey and baseball still grade decisive games, spreads and totals", () => {
    assert.equal(gradePick(ml("nhl", "home"), final(4, 2)), "win")
    assert.equal(gradePick(ml("mlb", "away"), final(4, 2)), "loss")
    assert.equal(gradePick({ sport: "nhl", kind: "spread", selection: "home", point: -1.5, player: null, statKey: null }, final(4, 2)), "win")
    assert.equal(gradePick({ sport: "mlb", kind: "total", selection: "over", point: 8.5, player: null, statKey: null }, final(5, 4)), "win")
  })
})

describe("team matching across feeds", () => {
  it("normalises St. and abbreviations", () => {
    assert.equal(normName("St. Louis City SC"), "saint louis city")
    assert.equal(normName("Kent St."), "kent state")
    assert.equal(normName("LAFC"), "los angeles")
    assert.equal(normName("D.C. United SC"), "dc united")
  })
  it("MLS names across ESPN, Polymarket and Kalshi", () => {
    assert.ok(sameTeam("New York City FC", "New York City FC"))
    assert.ok(sameTeam("LAFC", "Los Angeles FC"))
    assert.ok(sameTeamLoose("Saint Louis", "St. Louis CITY SC"))
    assert.ok(sameTeamLoose("New York RB", "New York Red Bulls"))
    assert.ok(sameTeamLoose("Los Angeles G", "LA Galaxy"))
    assert.ok(sameTeamLoose("Los Angeles F", "LAFC"))
    assert.ok(sameTeamLoose("Salt Lake", "Real Salt Lake"))
    assert.ok(sameTeamLoose("Orlando", "Orlando City SC"))
  })
  it("Los Angeles FC vs Galaxy resolves to one orientation", () => {
    const ref = { homeName: "LAFC", awayName: "LA Galaxy", startsAt: new Date("2026-10-18T02:00:00Z") }
    const m = matchGame(ref, [{ id: "k", teams: ["Los Angeles G", "Los Angeles F"] as [string, string], startsAt: null }], { requireTime: false, loose: true })
    assert.equal(m?.homeIndex, 1)
  })
  it("NHL and college names", () => {
    assert.ok(sameTeamLoose("New York R", "New York Rangers"))
    assert.ok(!sameTeamLoose("New York R", "New York Islanders"))
    assert.ok(sameTeamLoose("Utah", "Utah Mammoth"))
    assert.ok(sameTeam("Mammoth", "Utah Mammoth"))
    assert.ok(sameTeamLoose("Arizona St.", "Arizona State Sun Devils"))
    assert.ok(sameTeamLoose("Miami (OH)", "Miami (OH) RedHawks"))
  })
})
