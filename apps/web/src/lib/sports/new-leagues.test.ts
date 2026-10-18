import assert from "node:assert/strict"
import { afterEach, describe, it } from "node:test"
import { activeSports, ncaabEnabled } from "./flag.ts"
import { DEFAULT_PUBLISH, kindsFor, planPublication } from "./lines.ts"
import { SCOREBOARD_PATHS } from "./scoreboard.ts"
import { formatGameStatus } from "./game-status.ts"
import { marketTitle, SPORT_LABEL } from "./format.ts"
import { gradePick, MAX_PLAUSIBLE_SCORE, resolveResult, scoreProblem, FREE_RESULT_FAMILIES, DEFAULT_RESOLVE } from "./settlement.ts"
import { espnGroupsQuery, hasDraw, isSoccer, SOCCER_SPORTS, SPORTS, type EventResult } from "./types.ts"
import { oddsLabel, teamLook } from "./teams.ts"
import { leagueTeam, leagueTeamCount } from "./teams-leagues.ts"
import { EPL_TEAMS, LALIGA_TEAMS, NCAAB_TEAMS, UCL_TEAMS, WNBA_TEAMS } from "./teams-data.ts"
import { ESPN_PATH, KALSHI_SERIES, parseKalshiEvents, POLYMARKET_SERIES } from "./live/sources.ts"
import { liveSlate } from "./live/plan.ts"
import { normName, sameTeam, sameTeamLoose } from "./live/match.ts"
import { EspnResultsProvider, normalizeCompetition } from "./providers/espn.ts"
import { MockProvider } from "./providers/mock.ts"
import { normalizeOddsApiEvent, PROP_MARKETS, TheOddsApiProvider } from "./providers/the-odds-api.ts"
import { enabledSports } from "./providers/index.ts"

const SOCCER = ["mls", "epl", "laliga", "ucl"] as const
const NEW = ["epl", "laliga", "ucl", "wnba", "ncaab"] as const

describe("sport config", () => {
  it("lists the new sports once each, after the existing ones", () => {
    assert.deepEqual([...SPORTS].slice(0, 7), ["nfl", "nba", "tennis", "nhl", "mlb", "cfb", "mls"])
    assert.deepEqual([...SPORTS].slice(7), ["epl", "laliga", "ucl", "wnba", "ncaab"])
    assert.equal(new Set(SPORTS).size, SPORTS.length)
  })
  it("hasDraw is true for the soccer moneyline only", () => {
    for (const s of SOCCER) {
      assert.equal(hasDraw(s, "moneyline"), true, s)
      assert.equal(hasDraw(s, "spread"), false, s)
      assert.equal(hasDraw(s, "total"), false, s)
    }
    for (const s of ["nfl", "nba", "nhl", "mlb", "cfb", "tennis", "wnba", "ncaab", undefined]) assert.equal(hasDraw(s, "moneyline"), false, String(s))
    assert.deepEqual([...SOCCER_SPORTS], [...SOCCER])
    assert.equal(isSoccer("ucl"), true)
    assert.equal(isSoccer("wnba"), false)
  })
  it("three-way grading works for every soccer league and never for basketball", () => {
    const final = { source: "t", externalId: "x", status: "final" as const, homeScore: 1, awayScore: 1 }
    const line = (sport: string, selection: "home" | "away" | "draw") => ({ sport, kind: "moneyline" as const, selection, point: null, player: null, statKey: null })
    for (const s of SOCCER) {
      assert.equal(gradePick(line(s, "draw"), final), "win", s)
      assert.equal(gradePick(line(s, "home"), final), "loss", s)
    }
    for (const s of ["wnba", "ncaab"]) {
      assert.equal(gradePick(line(s, "home"), final), "void", `${s}: a tied basketball final is a feed error`)
      assert.equal(gradePick(line(s, "draw"), final), "void")
      assert.equal(gradePick(line(s, "home"), { ...final, homeScore: 80, awayScore: 70 }), "win")
    }
  })
  it("kinds: three markets, no props, for every new sport", () => {
    for (const s of NEW) {
      assert.deepEqual(kindsFor(s, DEFAULT_PUBLISH), ["moneyline", "spread", "total"], s)
      assert.deepEqual(PROP_MARKETS[s], [], s)
      assert.ok(SPORT_LABEL[s], s)
    }
    assert.equal(marketTitle({ kind: "total", player: null, statKey: null, event: { sport: "epl", home: "a", away: "b", startsAt: "" }, lines: [] } as never), "Total goals")
    assert.equal(marketTitle({ kind: "total", player: null, statKey: null, event: { sport: "wnba", home: "a", away: "b", startsAt: "" }, lines: [] } as never), "Total points")
  })
  it("one free results family each, like MLS and NBA", () => {
    for (const s of NEW) assert.equal(FREE_RESULT_FAMILIES[s], 1, s)
  })
})

describe("plausible scores", () => {
  it("soccer leagues share MLS's ceiling; basketball shares NBA's", () => {
    for (const s of ["epl", "laliga", "ucl"] as const) {
      assert.equal(MAX_PLAUSIBLE_SCORE[s], MAX_PLAUSIBLE_SCORE.mls)
      assert.equal(scoreProblem(s, 3, 2), null)
      assert.match(scoreProblem(s, 16, 0)!, /implausible/)
    }
    for (const s of ["wnba", "ncaab"] as const) {
      assert.equal(MAX_PLAUSIBLE_SCORE[s], MAX_PLAUSIBLE_SCORE.nba)
      assert.equal(scoreProblem(s, 98, 101), null)
      assert.match(scoreProblem(s, 201, 90)!, /implausible/)
    }
  })
})

describe("ESPN league paths", () => {
  it("maps every new sport in the live source, the scoreboard strip and the results provider", async () => {
    const paths = { epl: "soccer/eng.1", laliga: "soccer/esp.1", ucl: "soccer/uefa.champions", wnba: "basketball/wnba", ncaab: "basketball/mens-college-basketball" }
    for (const [s, p] of Object.entries(paths)) {
      assert.equal(ESPN_PATH[s], p, s)
      assert.deepEqual(SCOREBOARD_PATHS[s], [p], s)
      const urls: string[] = []
      const fake = (async (url: string) => {
        urls.push(url)
        return { ok: true, status: 200, json: async () => ({ events: [] }) }
      }) as unknown as typeof fetch
      await new EspnResultsProvider(fake, "https://espn.test").fetchResults(s as never, [{ externalId: "1", homeName: "a", awayName: "b", startsAt: new Date("2026-10-18T15:00:00Z") }])
      assert.ok(urls.length > 0 && urls.every((u) => u.startsWith(`https://espn.test/${p}/scoreboard?dates=`)), s)
      // Only men's college basketball needs the division I group; everything else is asked as before.
      assert.equal(urls.every((u) => u.endsWith("&groups=50")), s === "ncaab", s)
    }
    assert.equal(espnGroupsQuery("ncaab"), "&groups=50")
    assert.equal(espnGroupsQuery("mls"), "")
  })
  it("the exchange series for each new sport exist", () => {
    assert.deepEqual([POLYMARKET_SERIES.epl, POLYMARKET_SERIES.laliga, POLYMARKET_SERIES.ucl, POLYMARKET_SERIES.wnba, POLYMARKET_SERIES.ncaab], ["10188", "10193", "10204", "10105", "10470"])
    assert.deepEqual([KALSHI_SERIES.epl, KALSHI_SERIES.laliga, KALSHI_SERIES.ucl, KALSHI_SERIES.wnba, KALSHI_SERIES.ncaab], ["KXEPLGAME", "KXLALIGAGAME", "KXUCLGAME", "KXWNBAGAME", "KXNCAAMBGAME"])
  })
})

describe("soccer extra time review", () => {
  const comp = (name: string, home: string, away: string, hs: string, as: string) => ({
    id: "9",
    date: "2026-03-17T20:00Z",
    status: { type: { name, state: "post", completed: true } },
    competitors: [
      { homeAway: "home", score: hs, team: { displayName: home, location: home } },
      { homeAway: "away", score: as, team: { displayName: away, location: away } },
    ],
  })
  it("flags a Champions League knockout decided after 90 minutes and sends it to review", () => {
    for (const status of ["STATUS_FINAL_AET", "STATUS_FINAL_PEN"]) {
      const r = normalizeCompetition(comp(status, "Sporting CP", "Bodo/Glimt", "5", "0"), undefined, "ucl")!
      assert.equal(r.beyondRegulation, true, status)
      const out = resolveResult([r], { now: new Date("2026-03-18T14:00:00Z"), startsAt: new Date("2026-03-17T20:00:00Z"), finalFirstSeenAt: new Date("2026-03-17T23:00:00Z"), sport: "ucl" })
      assert.equal(out.kind, "review", status)
    }
  })
  it("an ordinary full time result in any soccer league is a normal final, not a review", () => {
    for (const s of ["epl", "laliga", "ucl"] as const) {
      const r = normalizeCompetition(comp("STATUS_FULL_TIME", "Arsenal", "Liverpool", "2", "2"), undefined, s)!
      assert.equal(r.status, "final")
      assert.equal(r.officialFinal, true)
      assert.equal(r.beyondRegulation, undefined)
      assert.equal(r.homeScore, 2)
      const out = resolveResult([r], { now: new Date("2026-03-18T14:00:00Z"), startsAt: new Date("2026-03-17T20:00:00Z"), finalFirstSeenAt: new Date("2026-03-17T23:00:00Z"), sport: s }, { ...DEFAULT_RESOLVE, minSources: 1 })
      assert.equal(out.kind, "final", s)
    }
  })
  it("basketball overtime is not flagged: the score already includes it", () => {
    const r = normalizeCompetition(comp("STATUS_FINAL_OT", "Las Vegas Aces", "New York Liberty", "101", "99"), undefined, "wnba")!
    assert.equal(r.beyondRegulation, undefined)
  })
})

describe("odds sport keys", () => {
  const requested = async (sport: "epl" | "laliga" | "ucl" | "wnba" | "ncaab") => {
    const urls: string[] = []
    const fake = async (url: string) => {
      urls.push(url)
      return { ok: true, status: 200, json: async () => [] }
    }
    const p = new TheOddsApiProvider("k", fake)
    await p.fetchOdds(sport, new Date("2026-10-18T12:00:00Z"))
    assert.equal(await p.estimateCost(sport), 3, "one key, three game markets, no props")
    return urls
  }
  it("asks the right Odds API key for each new sport", async () => {
    const keys = { epl: "soccer_epl", laliga: "soccer_spain_la_liga", ucl: "soccer_uefa_champs_league", wnba: "basketball_wnba", ncaab: "basketball_ncaab" } as const
    for (const [s, k] of Object.entries(keys)) {
      const urls = await requested(s as keyof typeof keys)
      assert.equal(urls.length, 1, s)
      assert.ok(urls[0]!.includes(`/sports/${k}/odds?`), s)
    }
  })
  it("reads the Draw outcome of a soccer h2h market, and ignores it elsewhere", () => {
    const raw = {
      id: "e1",
      commence_time: "2026-10-18T14:00:00Z",
      home_team: "Arsenal",
      away_team: "Liverpool",
      bookmakers: [{ key: "b", markets: [{ key: "h2h", outcomes: [{ name: "Arsenal", price: 120 }, { name: "Draw", price: 250 }, { name: "Liverpool", price: 210 }] }] }],
    }
    const sel = (sport: "epl" | "wnba") => normalizeOddsApiEvent(raw, sport).markets[0]!.outcomes.map((o) => o.selection)
    assert.deepEqual(sel("epl"), ["home", "draw", "away"])
    assert.deepEqual(sel("wnba"), ["home", "away"])
  })
})

describe("publishing", () => {
  it("drafts a three-way moneyline for each soccer league and a two-way one for basketball", async () => {
    const now = new Date("2026-10-18T12:00:00Z")
    for (const s of NEW) {
      const snap = await new MockProvider().fetchOdds(s, now)
      const plan = planPublication(snap, now, new Set())
      const ml = plan.drafts.find((d) => d.kind === "moneyline")
      assert.ok(ml, s)
      assert.deepEqual(ml.lines.map((l) => l.selection), isSoccer(s) ? ["home", "draw", "away"] : ["home", "away"], s)
      assert.ok(plan.drafts.every((d) => kindsFor(s, DEFAULT_PUBLISH).includes(d.kind)), s)
    }
  })
})

describe("college basketball flag", () => {
  const saved = process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED
  afterEach(() => {
    if (saved === undefined) delete process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED
    else process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED = saved
  })
  it("is off by default and switches with one variable", () => {
    delete process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED
    assert.equal(ncaabEnabled(), false)
    assert.equal(activeSports().includes("ncaab"), false)
    assert.deepEqual(activeSports(), SPORTS.filter((s) => s !== "ncaab"))
    // Publishing honours it, with or without the explicit sports list.
    assert.equal(enabledSports(activeSports()).includes("ncaab"), false)
    process.env.SPORTS_ENABLED_SPORTS = "ncaab,nba"
    assert.deepEqual(enabledSports(activeSports()), ["nba"])
    delete process.env.SPORTS_ENABLED_SPORTS
    process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED = "1"
    assert.equal(ncaabEnabled(), true)
    assert.deepEqual(activeSports(), [...SPORTS])
  })
  it("anything but 1 is off", () => {
    for (const v of ["0", "true", "", "admin"]) {
      process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED = v
      assert.equal(ncaabEnabled(), false, v)
    }
  })
})

describe("teams", () => {
  it("has every club and team", () => {
    assert.equal(EPL_TEAMS.length, 20)
    assert.equal(LALIGA_TEAMS.length, 20)
    assert.equal(UCL_TEAMS.length, 36)
    assert.equal(WNBA_TEAMS.length, 15)
    assert.ok(NCAAB_TEAMS.length >= 350)
    assert.equal(leagueTeamCount("ucl"), 36)
  })
  it("looks clubs up by ESPN name with ESPN logos", () => {
    assert.equal(teamLook("epl", "Arsenal").abbr, "ARS")
    assert.equal(teamLook("epl", "Arsenal").logo, "https://a.espncdn.com/i/teamlogos/soccer/500/359.png")
    assert.equal(teamLook("laliga", "Real Madrid").abbr, "RMA")
    assert.equal(teamLook("ucl", "Paris Saint-Germain").abbr, "PSG")
    assert.equal(teamLook("ucl", "Bodo/Glimt").abbr, "BODO")
    assert.equal(teamLook("wnba", "Las Vegas Aces").logo, "https://a.espncdn.com/i/teamlogos/wnba/500/lv.png")
    assert.equal(teamLook("wnba", "Aces").abbr, "LV")
    assert.equal(teamLook("ncaab", "Duke Blue Devils").logoDark?.includes("/ncaa/500-dark/"), true)
    assert.equal(teamLook("ncaab", "Duke").abbr, teamLook("ncaab", "Duke Blue Devils").abbr)
  })
  it("the same club resolves in every league it plays in", () => {
    assert.equal(leagueTeam("epl", "Arsenal")?.logo, leagueTeam("ucl", "Arsenal")?.logo)
    assert.equal(leagueTeam("laliga", "Barcelona")?.logo, leagueTeam("ucl", "Barcelona")?.logo)
  })
  it("uses the table's short name under the win-chance bar", () => {
    assert.equal(oddsLabel("epl", "Manchester United"), "Man United")
    assert.equal(oddsLabel("ucl", "Paris Saint-Germain"), leagueTeam("ucl", "Paris Saint-Germain")?.short)
    assert.equal(oddsLabel("wnba", "Las Vegas Aces"), "Aces")
  })
  it("unknown clubs fall back to initials", () => {
    assert.equal(teamLook("epl", "Atlantis United").logo, null)
  })
})

describe("exchange name matching for the new clubs", () => {
  // [ESPN name, the name Polymarket or Kalshi writes], from the live feeds on 2026-10-18.
  const PAIRS: [string, string][] = [
    ["Paris Saint-Germain", "PSG"],
    ["Internazionale", "Inter"],
    ["Internazionale", "FC Internazionale Milano"],
    ["Bayern Munich", "FC Bayern München"],
    ["Borussia Dortmund", "BV Borussia 09 Dortmund"],
    ["Borussia Dortmund", "Dortmund"],
    ["Slavia Prague", "SK Slavia Praha"],
    ["Sabah FK", "Sabah Masazir"],
    ["Bodo/Glimt", "FK Bodø/Glimt"],
    ["Bodo/Glimt", "Bodoe/Glimt"],
    ["Athletic Club", "Bilbao"],
    ["Espanyol", "RCD Espanyol de Barcelona"],
    ["Alavés", "Deportivo Alavés"],
    ["Deportivo", "RC Deportivo A Coruña"],
    ["Deportivo", "Deportivo De La Coruna"],
    ["Racing Santander", "Real Racing Club"],
    ["Atlético Madrid", "Club Atlético de Madrid"],
    ["Brighton & Hove Albion", "Brighton"],
    ["Manchester City", "Manchester City FC"],
  ]
  it("pairs each exchange spelling with the ESPN club", () => {
    for (const [espn, exchange] of PAIRS) assert.ok(sameTeamLoose(espn, exchange), `${espn} ~ ${exchange}`)
  })
  it("keeps look-alike clubs apart", () => {
    assert.equal(sameTeamLoose("Barcelona", "RCD Espanyol de Barcelona"), false)
    assert.equal(sameTeamLoose("Deportivo", "Deportivo Alavés"), false)
    assert.equal(sameTeamLoose("Alavés", "Deportivo"), false)
    assert.equal(sameTeam("Manchester United", "Manchester City"), false)
    assert.equal(sameTeamLoose("Real Madrid", "Real Betis"), false)
    assert.equal(normName("Arsenal"), "arsenal")
  })
  it("Kalshi series titles lose their 'Game N:' prefix", () => {
    const events = parseKalshiEvents({
      events: [{ event_ticker: "KXWNBAGAME-26OCT22GSATL", title: "Game 3: Golden State vs Atlanta", markets: [{ ticker: "a", yes_sub_title: "Golden State" }, { ticker: "b", yes_sub_title: "Atlanta" }] }],
    })
    assert.deepEqual(events[0]?.teams, ["Golden State", "Atlanta"])
  })
})

describe("live status labels", () => {
  const base = { startsAt: "2026-10-18T14:00:00Z", status: "live" as const, homeScore: "1", awayScore: "0", detail: "", asOf: 1_000_000 }
  it("soccer minute, halftime and penalties for the new leagues", () => {
    for (const s of ["epl", "laliga", "ucl"]) {
      assert.equal(formatGameStatus({ ...base, sport: s, statusName: "STATUS_SECOND_HALF", clock: "72:10", period: 2 }, 1_000_000).text, "72'", s)
      assert.equal(formatGameStatus({ ...base, sport: s, statusName: "STATUS_HALFTIME", period: 1 }, 1_000_000).text, "HT", s)
      assert.equal(formatGameStatus({ ...base, sport: s, statusName: "STATUS_SHOOTOUT" }, 1_000_000).text, "Pens", s)
    }
  })
  it("quarters for the WNBA, halves for men's college basketball", () => {
    assert.equal(formatGameStatus({ ...base, sport: "wnba", statusName: "STATUS_IN_PROGRESS", period: 3, clock: "5:12" }, 1_000_000).text, "Q3 5:12")
    assert.equal(formatGameStatus({ ...base, sport: "ncaab", statusName: "STATUS_IN_PROGRESS", period: 2, clock: "8:40" }, 1_000_000).text, "H2 8:40")
    assert.equal(formatGameStatus({ ...base, sport: "ncaab", statusName: "STATUS_IN_PROGRESS", period: 3, clock: "2:00" }, 1_000_000).text, "OT 2:00")
  })
})

describe("live slate window", () => {
  it("keeps a Champions League game (extra time, penalties) polled longer than a league game", () => {
    const start = new Date("2026-10-20T19:00:00Z")
    const ev = (sport: string) => ({ id: sport, sport, status: "scheduled", startsAt: start, homeName: "a", awayName: "b" })
    const at = (h: number) => new Date(start.getTime() + h * 3600_000)
    assert.equal(liveSlate([ev("epl")], at(3.2)).length, 0)
    assert.equal(liveSlate([ev("ucl")], at(3.2)).length, 1)
    assert.equal(liveSlate([ev("ucl")], at(3.6)).length, 0)
    assert.equal(liveSlate([ev("wnba")], at(2.9)).length, 1)
  })
})
