import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { matchExchangeGame, sameTeam } from "./match.ts"
import { gammaGamesUrl, POLYMARKET_SERIES } from "./sources.ts"

const at = new Date("2026-10-23T23:00:00Z")
const game = (teams: [string, string], startsAt = at) => ({ id: teams.join("-"), teams, startsAt })

describe("exchange matching with stored ESPN full names", () => {
  it("college football: Polymarket's bare school names match the stored full names", () => {
    const m = matchExchangeGame("cfb", { homeName: "Virginia Cavaliers", awayName: "Duke Blue Devils", startsAt: at }, [game(["Duke", "Virginia"]), game(["Yale", "Penn"])])
    assert.equal(m?.candidate.id, "Duke-Virginia")
    assert.equal(m?.homeIndex, 1)
  })
  it("NHL: Polymarket's 'Utah' matches Utah Mammoth", () => {
    const m = matchExchangeGame("nhl", { homeName: "Seattle Kraken", awayName: "Utah Mammoth", startsAt: at }, [game(["Utah", "Kraken"])])
    assert.equal(m?.homeIndex, 1)
  })
  it("the loose retry still refuses an ambiguous fit and is not used for the NBA", () => {
    assert.equal(matchExchangeGame("cfb", { homeName: "Miami Hurricanes", awayName: "Duke Blue Devils", startsAt: at }, [game(["Duke", "Miami"]), game(["Duke", "Miami"], new Date(at.getTime() + 60_000))]), null)
    assert.equal(matchExchangeGame("nba", { homeName: "Utah Jazz", awayName: "Boston Celtics", startsAt: at }, [game(["Boston", "Utah"])]), null)
  })
  it("aliases: UMass and Louisiana-Monroe", () => {
    assert.ok(sameTeam("UMass", "Massachusetts"))
    assert.ok(sameTeam("Louisiana-Monroe", "UL Monroe"))
    assert.ok(!sameTeam("Louisiana", "UL Monroe"))
  })
})

describe("Gamma game window", () => {
  it("MLB looks a week further on end date (postseason games end a week after first pitch); other sports do not", () => {
    const from = Date.parse("2026-10-23T00:00:00Z")
    const to = Date.parse("2026-10-24T00:00:00Z")
    assert.match(gammaGamesUrl(POLYMARKET_SERIES.mlb!, from, to), /end_date_max=2026-11-01T00:00:00\.000Z/)
    assert.match(gammaGamesUrl(POLYMARKET_SERIES.nba!, from, to), /end_date_max=2026-10-24T00:00:00\.000Z/)
  })
})
