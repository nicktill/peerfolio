import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"
import { EXCHANGE_PUBLISH, planPublication } from "../lines.ts"
import { gradePick, playerStat } from "../settlement.ts"
import type { EventResult } from "../types.ts"
import { EspnResultsProvider, parseBoxscore, type EspnSummary } from "./espn.ts"
import { ExchangeOddsProvider, parseGammaGroups, parsePropMarket, planProps } from "./polymarket-odds.ts"

const here = dirname(fileURLToPath(import.meta.url))
const read = (name: string) => JSON.parse(readFileSync(join(here, "fixtures", name), "utf8"))
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x))

/* Fragments captured from gamma-api.polymarket.com on 2026-10-17 (events nba-bos-det-2026-10-20, nfl-hou-jax-2026-10-18-player-props). */
const NBA_POINTS = {
  question: "Jayson Tatum: Points O/U 26.5",
  groupItemTitle: "Jayson Tatum: Points O/U 26.5",
  sportsMarketType: "points",
  line: 26.5,
  outcomes: '["Yes", "No"]',
  clobTokenIds: '["tYes", "tNo"]',
  bestBid: 0.48,
  bestAsk: 0.5,
  liquidityNum: 375.2,
  acceptingOrders: true,
  description:
    'In the upcoming NBA game, scheduled for October 20 at 3:00 PM ET:\n\nThis market will resolve to "Yes" if Jayson Tatum scores more than 26.5 points during the game.\n\nThis market will resolve to "No" if Jayson Tatum scores 26.5 points or fewer during the game.\n\nIf the player is listed as inactive or otherwise does not take the court at any point, the market will resolve "No".',
}
const NFL_RUSH = {
  question: "Bhayshul Tuten: Rushing Yards O/U 19.5",
  sportsMarketType: "rushing_yards",
  line: 19.5,
  outcomes: '["Over", "Under"]',
  clobTokenIds: '["tOver", "tUnder"]',
  bestBid: 0.5,
  bestAsk: 0.52,
  liquidityNum: 103.4,
  acceptingOrders: true,
  description: 'This market will resolve to "Over" if Bhayshul Tuten records more than 19.5 rushing yards in this game, and to "Under" if Bhayshul Tuten records 19.5 or fewer rushing yards.',
}
const ANYTIME_TD = { question: "Bhayshul Tuten: Anytime Touchdown", sportsMarketType: "anytime_touchdowns", line: null, outcomes: '["Yes", "No"]', clobTokenIds: '["a", "b"]', bestBid: 0.35, bestAsk: 0.4, liquidityNum: 9611 }

describe("parsePropMarket", () => {
  it("reads Yes/No (NBA) and Over/Under (NFL) player markets, with the over token and the over mid", () => {
    const nba = parsePropMarket(NBA_POINTS)!
    assert.deepEqual([nba.type, nba.player, nba.line, nba.overToken, nba.coarse], ["points", "Jayson Tatum", 26.5, "tYes", 0.49])
    const nfl = parsePropMarket(NFL_RUSH)!
    assert.deepEqual([nfl.type, nfl.player, nfl.line, nfl.overToken], ["rushing_yards", "Bhayshul Tuten", 19.5, "tOver"])
    assert.equal(parsePropMarket({ ...NBA_POINTS, outcomes: '["No", "Yes"]' })!.overToken, "tNo", "the Yes outcome is the over side wherever it is listed")
  })

  it("refuses everything it cannot settle exactly", () => {
    assert.equal(parsePropMarket(ANYTIME_TD), null, "touchdown scorers are not in the box score reliably (return and defensive TDs)")
    assert.equal(parsePropMarket({ ...NBA_POINTS, line: 26, question: "Jayson Tatum: Points O/U 26" }), null, "whole-number line could push")
    assert.equal(parsePropMarket({ ...NBA_POINTS, description: 'resolve to "Yes" if Jayson Tatum scores at least 26.5 points' }), null, "rules must say more than")
    assert.equal(parsePropMarket({ ...NBA_POINTS, question: "Jayson Tatum: Rebounds O/U 26.5" }), null, "stat in the question must match the market type")
    assert.equal(parsePropMarket({ ...NBA_POINTS, question: "Jayson Tatum: Points O/U 25.5" }), null, "question line must equal the line field")
    assert.equal(parsePropMarket({ ...NBA_POINTS, outcomes: '["Tatum", "Pistons"]' }), null)
    assert.equal(parsePropMarket({ ...NBA_POINTS, sportsMarketType: "threes" }), null)
  })

  it("wide Gamma books carry no coarse mid", () => {
    assert.equal(parsePropMarket({ ...NBA_POINTS, bestBid: 0.11, bestAsk: 0.53 })!.coarse, null)
  })
})

describe("Gamma groups with props", () => {
  it("takes props from the main event and the -player-props companion, and nothing else from the companion", () => {
    const groups = parseGammaGroups([
      { slug: "nba-aaa-bbb-2026-10-20", title: "A vs. B", startTime: "2026-10-20T19:00:00Z", markets: [NBA_POINTS] },
      { slug: "nfl-aaa-bbb-2026-10-18", title: "A vs. B", startTime: "2026-10-18T13:30:00Z", markets: [] },
      { slug: "nfl-aaa-bbb-2026-10-18-player-props", title: "props", markets: [NFL_RUSH, ANYTIME_TD, { ...NFL_RUSH, sportsMarketType: "moneyline", question: "x" }] },
    ])
    assert.equal(groups.length, 2)
    assert.equal(groups[0]!.props.length, 1)
    assert.equal(groups[1]!.props.length, 1)
    assert.equal(groups[1]!.markets.length, 0, "a moneyline inside the props event is not a game line")
  })
})

describe("planProps", () => {
  const prop = (over: object) => ({ ...parsePropMarket(NBA_POINTS)!, ...over })
  it("keeps one group per stat and player, nearest 50% first, and drops sports without props", () => {
    const groups = planProps("nba", [prop({ line: 24.5, coarse: 0.6 }), prop({ line: 26.5, coarse: 0.5 }), prop({ player: "Cade Cunningham" })])
    assert.equal(groups.length, 2)
    assert.deepEqual(groups.find((g) => g.player === "Jayson Tatum")!.candidates.map((c) => c.line), [26.5, 24.5])
    assert.deepEqual(planProps("nhl", [prop({})]), [])
    assert.deepEqual(planProps("nba", [prop({ coarse: null }), prop({ liquidity: 10 }), prop({ acceptingOrders: false }), prop({ coarse: 0.9 })]), [])
  })
  it("never offers a stat of another sport", () => {
    assert.deepEqual(planProps("nfl", [prop({})]), [])
  })
})

describe("end to end: Polymarket props -> exchange snapshot -> published draft", () => {
  type Fx = { now: string; espn: unknown; gamma: { markets: unknown[] }[]; clob: { asset_id: string; timestamp: string }[]; kalshi: unknown }
  const fixture = () => {
    const fx = clone(read("exchange-nba-2026-10-17.json")) as Fx
    const ts = fx.clob[0].timestamp
    const book = (token: string, bid: number, ask: number, size: number) => ({
      asset_id: token,
      timestamp: ts,
      bids: [{ price: String(bid), size: String(size) }],
      asks: [{ price: String(ask), size: String(size) }],
    })
    const mk = (player: string, type: string, label: string, line: number, token: string) => ({
      ...NBA_POINTS,
      question: `${player}: ${label} O/U ${line}`,
      sportsMarketType: type,
      line,
      clobTokenIds: JSON.stringify([token, token + "n"]),
      description: `This market will resolve to "Yes" if ${player} scores more than ${line} points during the game.`,
      updatedAt: new Date(new Date(fx.now).getTime() - 60_000).toISOString(),
    })
    const markets = fx.gamma[0].markets
    markets.push(mk("Jayson Tatum", "points", "Points", 26.5, "p1"), mk("Cade Cunningham", "rebounds", "Rebounds", 5.5, "p2"), mk("Jalen Duren", "assists", "Assists", 4.5, "p3"), mk("Paul George", "points", "Points", 15.5, "p4"))
    fx.clob.push(book("p1", 0.48, 0.5, 400), book("p2", 0.49, 0.51, 400), book("p3", 0.46, 0.55, 400) /* too wide */, book("p4", 0.5, 0.52, 20) /* too thin */)
    return fx
  }
  const run = async (fx: Fx) => {
    const calls: string[] = []
    const f = (async (input: unknown, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      const json = (b: unknown) => new Response(JSON.stringify(b), { headers: { "content-type": "application/json" } })
      if (url.includes("espn.com")) return json(fx.espn)
      if (url.includes("gamma-api")) return json(fx.gamma)
      if (url.includes("clob.polymarket.com")) {
        const want = new Set((JSON.parse(String(init?.body)) as { token_id: string }[]).map((x) => x.token_id))
        return json(fx.clob.filter((b) => want.has(b.asset_id)))
      }
      return json(fx.kalshi)
    }) as typeof fetch
    const p = new ExchangeOddsProvider({ fetch: f, sleep: async () => {}, windowMs: 4 * 86_400_000 })
    return p.fetchOdds("nba", new Date(new Date(fx.now).getTime() + 2_000))
  }

  it("publishes only props whose book passes the repricer gates, hides the rest, and holds gate misses", async () => {
    const snap = await run(fixture())
    const ev = snap.events.find((e) => e.homeName === "Detroit Pistons")!
    const props = ev.markets.filter((m) => m.kind === "player_prop")
    assert.deepEqual(props.map((m) => `${m.key}|${m.player}`).sort(), ["player_points|Jayson Tatum", "player_rebounds|Cade Cunningham"])
    const tatum = props.find((m) => m.player === "Jayson Tatum")!
    assert.deepEqual(tatum.outcomes.map((o) => [o.selection, o.quotes[0]!.point]), [["over", 26.5], ["under", 26.5]])
    assert.match(snap.notes!.join(" "), /player_assists: book too wide x1/)
    assert.match(snap.notes!.join(" "), /player_points: book too thin x1/)
    assert.ok(snap.held!.includes(`${ev.externalId}::player_assists|Jalen Duren`))
    assert.ok(snap.held!.includes(`${ev.externalId}::player_points|Paul George`))
  })

  it("flows through the normal pipeline as player_prop drafts with the house margin, a point line and the stat key", async () => {
    const snap = await run(fixture())
    const plan = planPublication(snap, new Date(snap.fetchedAt), new Set(), { ...EXCHANGE_PUBLISH, publishWindowMs: 5 * 86_400_000 })
    const d = plan.drafts.find((x) => x.kind === "player_prop" && x.player === "Jayson Tatum")!
    assert.ok(d)
    assert.equal(d.statKey, "player_points")
    assert.deepEqual(d.lines.map((l) => [l.selection, l.point]), [["over", 26.5], ["under", 26.5]])
    assert.ok(d.lines.every((l) => l.price < 0 && l.price > -125), "near even money, margin taken: both sides slightly worse than +100")
  })

  it("a game with props only on thin books still publishes its game lines unchanged", async () => {
    const fx = fixture()
    fx.clob = fx.clob.map((b) => (/^p\d$/.test(b.asset_id) ? { ...b, bids: [{ price: "0.1", size: "1" }] } : b))
    const snap = await run(fx)
    const ev = snap.events.find((e) => e.homeName === "Detroit Pistons")!
    assert.equal(ev.markets.filter((m) => m.kind === "player_prop").length, 0)
    assert.ok(ev.markets.some((m) => m.key === "moneyline"))
  })
})

describe("box score extraction (ESPN summary)", () => {
  const nba = read("espn-box-nba-401908946.json") as EspnSummary
  const nfl = read("espn-box-nfl-401872984.json") as EspnSummary
  const nbaScores = { "Detroit Pistons": 129, "Toronto Raptors": 125 }

  it("NBA: points, rebounds and assists for players who played; DNP rows and zero-minute rows are absent", () => {
    const s = parseBoxscore(nba, "nba", nbaScores)!
    assert.deepEqual(s["Cade Cunningham"], { player_points: 18, player_rebounds: 1, player_assists: 7 })
    assert.deepEqual(s["Malachi Smith"], { player_points: 24, player_rebounds: 7, player_assists: 3 })
    assert.equal(s["Kyle Anderson"], undefined, "didNotPlay")
    assert.equal(s["Ugonna Onyenso"], undefined, "didNotPlay")
  })

  it("NBA: points that do not add up to the final score make the whole box score untrusted", () => {
    assert.equal(parseBoxscore(nba, "nba", { ...nbaScores, "Detroit Pistons": 130 }), null)
    assert.ok(parseBoxscore(nba, "nba"), "no score to check against: still parsed")
  })

  it("NBA: a player with stat rows but zero minutes is treated as not having played", () => {
    const s = clone(nba)
    const row = s.boxscore!.players![1]!.statistics![0]!.athletes![0]!
    row.stats![0] = "0"
    assert.equal(parseBoxscore(s, "nba")![row.athlete!.displayName!], undefined)
  })

  it("NFL: passing, rushing and receiving yards merge per player across categories", () => {
    const s = parseBoxscore(nfl, "nfl")!
    assert.deepEqual(s["C.J. Stroud"], { player_pass_yds: 261, player_rush_yds: 5 })
    assert.equal(s["Woody Marks"]!.player_rush_yds, 62)
    assert.equal(s["Nico Collins"]!.player_reception_yds, 56)
    assert.equal(s["Cam Ward"]!.player_pass_yds, 170)
  })

  it("two players with the same folded name in one game are dropped, not guessed", () => {
    const s = clone(nba)
    s.boxscore!.players![1]!.statistics![0]!.athletes![0]!.athlete!.displayName = "Cade  Cunningham"
    s.boxscore!.players![0]!.statistics![0]!.athletes![0]!.athlete!.displayName = "Cade Cunningham"
    assert.equal(parseBoxscore(s, "nba")!["Cade Cunningham"], undefined)
  })

  it("sports without prop settlement and malformed payloads give nothing", () => {
    assert.equal(parseBoxscore(nba, "nhl"), null)
    assert.equal(parseBoxscore({}, "nba"), null)
    assert.equal(parseBoxscore({ boxscore: { players: [] } }, "nfl"), null)
  })
})

describe("grading props from box scores", () => {
  const stats = parseBoxscore(read("espn-box-nfl-401872984.json"), "nfl")!
  const final = (): EventResult => ({ source: "espn", externalId: "1", status: "final", homeScore: 3, awayScore: 26, playerStats: stats })
  const line = (player: string, statKey: string, selection: "over" | "under", point: number) => ({ sport: "nfl", kind: "player_prop" as const, selection, point, player, statKey })

  it("grades over/under against the box score, a push on the line itself", () => {
    assert.equal(gradePick(line("C.J. Stroud", "player_pass_yds", "over", 249.5), final()), "win")
    assert.equal(gradePick(line("C.J. Stroud", "player_pass_yds", "under", 249.5), final()), "loss")
    assert.equal(gradePick(line("C.J. Stroud", "player_pass_yds", "over", 261), final()), "push")
  })

  it("matches the exchange's spelling of a name to ESPN's", () => {
    assert.equal(playerStat(stats, "CJ Stroud", "player_pass_yds"), 261)
    assert.equal(playerStat(stats, "Wan’Dale Robinson", "player_reception_yds"), 53)
    assert.equal(gradePick(line("Woody Marks", "player_rush_yds", "over", 59.5), final()), "win")
  })

  it("voids (refunds) when the player is not in the box score, the stat is missing or there is no box score at all", () => {
    assert.equal(gradePick(line("Nobody Real", "player_pass_yds", "over", 1.5), final()), "void")
    assert.equal(gradePick(line("Woody Marks", "player_pass_yds", "over", 1.5), final()), "void", "he has no passing line")
    assert.equal(gradePick(line("C.J. Stroud", "player_pass_yds", "over", 249.5), { ...final(), playerStats: undefined }), "void")
  })

  it("an ambiguous folded name reads as missing", () => {
    const dup = { "J. Smith": { player_rush_yds: 10 }, "J Smith": { player_rush_yds: 99 } }
    assert.equal(playerStat(dup, "J.Smith", "player_rush_yds"), undefined)
  })
})

describe("ESPN results provider attaches box scores only where props are open", () => {
  const board = (id: string, start: string) => ({
    events: [
      {
        id,
        date: start,
        status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
        competitions: [
          {
            id,
            date: start,
            status: { type: { name: "STATUS_FINAL", state: "post", completed: true } },
            competitors: [
              { homeAway: "home", score: "129", team: { displayName: "Detroit Pistons", location: "Detroit" } },
              { homeAway: "away", score: "125", team: { displayName: "Toronto Raptors", location: "Toronto" } },
            ],
          },
        ],
      },
    ],
  })
  const start = new Date("2026-10-16T23:00:00Z")
  const make = (summaryOk: boolean) => {
    const calls: string[] = []
    const f = (async (input: unknown) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("/scoreboard")) return new Response(JSON.stringify(board("401908946", start.toISOString())))
      if (url.includes("/summary")) return summaryOk ? new Response(JSON.stringify(read("espn-box-nba-401908946.json"))) : new Response("no", { status: 500 })
      return new Response("?", { status: 404 })
    }) as typeof fetch
    return { p: new EspnResultsProvider(f, "https://espn.test"), calls }
  }
  const ref = { externalId: "401908946", homeName: "Detroit Pistons", awayName: "Toronto Raptors", startsAt: start }

  it("fetches the summary for an event with props and returns its stats", async () => {
    const { p, calls } = make(true)
    const [r] = await p.fetchResults("nba", [{ ...ref, wantPlayerStats: true }])
    assert.equal(r!.playerStats!["Cade Cunningham"]!.player_points, 18)
    assert.equal(calls.filter((c) => c.includes("/summary?event=401908946")).length, 1)
  })

  it("does not spend a request on events without props", async () => {
    const { p, calls } = make(true)
    const [r] = await p.fetchResults("nba", [ref])
    assert.equal(r!.playerStats, undefined)
    assert.equal(calls.some((c) => c.includes("/summary")), false)
  })

  it("a failed box score leaves the final without stats, so the props wait instead of grading", async () => {
    const { p } = make(false)
    const [r] = await p.fetchResults("nba", [{ ...ref, wantPlayerStats: true }])
    assert.equal(r!.status, "final")
    assert.equal(r!.playerStats, undefined)
  })
})
