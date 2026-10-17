import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { CFB_TEAMS, MLB_TEAMS, MLS_TEAMS, NHL_TEAMS } from "./teams-data.ts"
import { LEAGUE_SPORTS, leagueTeam, leagueTeamCount, type LeagueSport } from "./teams-leagues.ts"
import { oddsLabel, onColor, teamLook } from "./teams.ts"

const abbr = (s: LeagueSport, n: string) => leagueTeam(s, n)?.abbr ?? null

describe("league team coverage", () => {
  it("has every team", () => {
    assert.equal(NHL_TEAMS.length, 32)
    assert.equal(MLB_TEAMS.length, 30)
    assert.equal(MLS_TEAMS.length, 30)
    assert.ok(CFB_TEAMS.length >= 134, `fbs ${CFB_TEAMS.length}`)
    assert.equal(leagueTeamCount("cfb"), CFB_TEAMS.length)
  })
  it("resolves every team's own full and short name to itself", () => {
    for (const s of LEAGUE_SPORTS) {
      const rows = { nhl: NHL_TEAMS, mlb: MLB_TEAMS, cfb: CFB_TEAMS, mls: MLS_TEAMS }[s]
      for (const [name, , , , key, short] of rows) {
        const hit = leagueTeam(s, name)
        assert.ok(hit, `${s} ${name}`)
        assert.ok(hit.logo.endsWith(`/${key}.png`), `${s} ${name} logo`)
        assert.ok(leagueTeam(s, short), `${s} short ${short}`)
      }
    }
  })
  it("gives readable colours", () => {
    for (const s of LEAGUE_SPORTS) {
      for (const row of { nhl: NHL_TEAMS, mlb: MLB_TEAMS, cfb: CFB_TEAMS, mls: MLS_TEAMS }[s]) {
        const t = leagueTeam(s, row[0])!
        assert.match(t.color, /^#[0-9a-f]{6}$/, t.name)
        assert.ok(["#fff", "#101418"].includes(onColor(t.color)))
      }
    }
  })
})

describe("league name lookup", () => {
  it("nhl: full, nickname, aliases", () => {
    assert.equal(abbr("nhl", "Boston Bruins"), "BOS")
    assert.equal(abbr("nhl", "Bruins"), "BOS")
    assert.equal(abbr("nhl", "Montreal Canadiens"), "MTL")
    assert.equal(abbr("nhl", "St. Louis Blues"), "STL")
    assert.equal(abbr("nhl", "Utah Hockey Club"), leagueTeam("nhl", "Utah Mammoth")?.abbr)
    assert.equal(abbr("nhl", "Vegas Golden Knights"), "VGK")
    assert.equal(abbr("nhl", "New York"), null, "two NY teams")
  })
  it("mlb: full, nickname, aliases", () => {
    assert.equal(abbr("mlb", "New York Yankees"), "NYY")
    assert.equal(abbr("mlb", "Yankees"), "NYY")
    assert.equal(abbr("mlb", "Oakland Athletics"), "ATH")
    assert.equal(abbr("mlb", "Chicago WS"), "CHW")
    assert.equal(abbr("mlb", "Chicago"), null)
  })
  it("cfb: full name, school only, nickname only, aliases", () => {
    assert.equal(abbr("cfb", "Ohio State Buckeyes"), "OSU")
    assert.equal(abbr("cfb", "Ohio State"), "OSU")
    assert.equal(abbr("cfb", "Buckeyes"), "OSU")
    assert.equal(abbr("cfb", "Ohio"), leagueTeam("cfb", "Ohio Bobcats")?.abbr)
    assert.notEqual(leagueTeam("cfb", "Ohio")?.logo, leagueTeam("cfb", "Ohio State")?.logo)
    assert.equal(leagueTeam("cfb", "Miami (FL)")?.name, "Miami Hurricanes")
    assert.equal(leagueTeam("cfb", "Miami (OH)")?.name, "Miami (OH) RedHawks")
    assert.equal(leagueTeam("cfb", "Mississippi St")?.name, "Mississippi State Bulldogs")
    assert.equal(leagueTeam("cfb", "Ole Miss")?.name, "Ole Miss Rebels")
    assert.equal(leagueTeam("cfb", "Texas A&M")?.name, "Texas A&M Aggies")
    assert.equal(leagueTeam("cfb", "Hawaii")?.name, "Hawai'i Rainbow Warriors")
    assert.equal(leagueTeam("cfb", "Southern California")?.name, "USC Trojans")
    assert.equal(leagueTeam("cfb", "Pitt")?.name, "Pittsburgh Panthers")
    assert.equal(leagueTeam("cfb", "San Jose State")?.name, "San José State Spartans")
    assert.equal(leagueTeam("cfb", "Fighting Irish")?.name, "Notre Dame Fighting Irish")
    assert.equal(leagueTeam("cfb", "Tigers"), null, "ambiguous nickname")
    assert.equal(leagueTeam("cfb", "Washington")?.name, "Washington Huskies")
    assert.equal(leagueTeam("cfb", "Washington State")?.name, "Washington State Cougars")
  })
  it("mls: ESPN, Polymarket and Kalshi spellings", () => {
    assert.equal(leagueTeam("mls", "Inter Miami CF")?.name, "Inter Miami CF")
    assert.equal(leagueTeam("mls", "Inter Miami")?.name, "Inter Miami CF")
    assert.equal(leagueTeam("mls", "Los Angeles FC")?.name, "LAFC")
    assert.equal(leagueTeam("mls", "LA Galaxy")?.name, "LA Galaxy")
    assert.equal(leagueTeam("mls", "Los Angeles Galaxy")?.name, "LA Galaxy")
    assert.equal(leagueTeam("mls", "New York RB")?.name, "Red Bull New York")
    assert.equal(leagueTeam("mls", "New York Red Bulls")?.name, "Red Bull New York")
    assert.equal(leagueTeam("mls", "New York City FC")?.name, "New York City FC")
    assert.equal(leagueTeam("mls", "Seattle Sounders")?.name, "Seattle Sounders FC")
    assert.equal(leagueTeam("mls", "Sounders")?.name, "Seattle Sounders FC")
    assert.equal(leagueTeam("mls", "CF Montreal")?.name, "CF Montréal")
  })
})

describe("teamLook for the new leagues", () => {
  it("returns an ESPN logo URL of the right shape, plus a dark variant", () => {
    assert.equal(teamLook("nhl", "Boston Bruins").logo, "https://a.espncdn.com/i/teamlogos/nhl/500/bos.png")
    assert.equal(teamLook("nhl", "Boston Bruins").logoDark, "https://a.espncdn.com/i/teamlogos/nhl/500-dark/bos.png")
    assert.equal(teamLook("mlb", "Boston Red Sox").logo, "https://a.espncdn.com/i/teamlogos/mlb/500/bos.png")
    assert.equal(teamLook("cfb", "Ohio State").logo, "https://a.espncdn.com/i/teamlogos/ncaa/500/194.png")
    assert.equal(teamLook("mls", "Atlanta United").logo, "https://a.espncdn.com/i/teamlogos/soccer/500/18418.png")
  })
  it("every logo URL is an https ESPN png", () => {
    for (const s of LEAGUE_SPORTS)
      for (const row of { nhl: NHL_TEAMS, mlb: MLB_TEAMS, cfb: CFB_TEAMS, mls: MLS_TEAMS }[s]) {
        const l = teamLook(s, row[0])
        assert.match(l.logo!, /^https:\/\/a\.espncdn\.com\/i\/teamlogos\/(nhl|mlb|ncaa|soccer)\/500\/[a-z0-9]+\.png$/)
        assert.match(l.logoDark!, /\/500-dark\//)
      }
  })
  it("unknown teams fall back to initials on neutral", () => {
    const l = teamLook("cfb", "Hogwarts Wizards")
    assert.equal(l.abbr, "HW")
    assert.equal(l.logo, null)
    assert.equal(l.color, "#64748b")
  })
  it("keeps NFL and NBA working", () => {
    assert.equal(teamLook("nfl", "Kansas City Chiefs").abbr, "KC")
    assert.equal(teamLook("nba", "Celtics").abbr, "BOS")
  })
})

describe("oddsLabel", () => {
  it("uses the short name for MLS clubs that end in a bare suffix", () => {
    assert.equal(oddsLabel("mls", "Inter Miami CF"), "Miami")
    assert.equal(oddsLabel("mls", "Seattle Sounders FC"), "Seattle")
  })
  it("uses the last word elsewhere", () => {
    assert.equal(oddsLabel("nhl", "Toronto Maple Leafs"), "Leafs")
    assert.equal(oddsLabel("tennis", "Jannik Sinner"), "Sinner")
    assert.equal(oddsLabel("mls", "Unknown Club"), "Club")
  })
})
