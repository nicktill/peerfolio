/**
 * Team identity for the leagues beyond NFL/NBA (NHL, MLB, FBS college football, MLS): abbreviation, brand colours and
 * ESPN logo URLs, resolved from the generated tables in teams-data.ts. Pure data and lookup, no network.
 *
 * Names arrive written many ways ("Ohio State Buckeyes" on ESPN, "Ohio State" on Polymarket, "Buckeyes" in props), so
 * each team is indexed under its normalised full name, short name, known aliases, then (when unambiguous within the
 * league) every whole-word suffix ("buckeyes") and a prefix with the nickname dropped ("ohio state"). Normalisation
 * is the same one the live matcher uses, so the two always agree about what counts as the same name.
 */
import { normName } from "./live/match.ts"
import { CFB_TEAMS, MLB_TEAMS, MLS_TEAMS, NHL_TEAMS, type TeamRow } from "./teams-data.ts"

export type LeagueTeam = {
  name: string
  abbr: string
  /** Brand colour for the badge background; never near-white. */
  color: string
  logo: string
  /** Logo variant ESPN draws for dark backgrounds. */
  logoDark: string
  /** Short display name from the table ("Seattle", "Salt Lake"). */
  short: string
}

export const LEAGUE_SPORTS = ["nhl", "mlb", "cfb", "mls"] as const
export type LeagueSport = (typeof LEAGUE_SPORTS)[number]

const NEUTRAL = "#64748b"
const CDN = "https://a.espncdn.com/i/teamlogos"
const FOLDER: Record<LeagueSport, string> = { nhl: "nhl", mlb: "mlb", cfb: "ncaa", mls: "soccer" }

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
}

/** ESPN's primary colour, unless it is near-white (invisible as a badge), then the alternate, then neutral. */
function pickColor(primary: string, alt: string): string {
  if (primary && luminance(primary) < 0.85) return primary
  if (alt && luminance(alt) < 0.85) return alt
  return primary || alt || NEUTRAL
}

export function logoUrl(sport: LeagueSport, key: string, dark = false): string {
  return `${CDN}/${FOLDER[sport]}/${dark ? "500-dark" : "500"}/${key}.png`
}

/** Names feeds use that no suffix/prefix rule reaches, keyed by team display name. Normalised when indexed. */
const ALIASES: Record<LeagueSport, Record<string, string[]>> = {
  nhl: {
    "Utah Mammoth": ["Utah Hockey Club", "Utah HC"],
    "Vegas Golden Knights": ["Las Vegas Golden Knights", "Las Vegas Knights"],
    "New York Rangers": ["NY Rangers"],
    "New York Islanders": ["NY Islanders"],
    "Los Angeles Kings": ["LA Kings"],
    "Montréal Canadiens": ["Montreal Canadiens"],
    "St. Louis Blues": ["St Louis Blues"],
  },
  mlb: {
    Athletics: ["Oakland Athletics", "Sacramento Athletics", "Las Vegas Athletics", "A's", "Oakland A's"],
    "New York Yankees": ["NY Yankees"],
    "New York Mets": ["NY Mets"],
    "Los Angeles Dodgers": ["LA Dodgers"],
    "Los Angeles Angels": ["LA Angels", "Anaheim Angels", "California Angels"],
    "Chicago White Sox": ["Chi White Sox", "Chicago WS"],
    "Arizona Diamondbacks": ["Arizona D-backs", "Arizona Dbacks", "D-backs"],
    "Cleveland Guardians": ["Cleveland Indians"],
  },
  cfb: {
    "Ole Miss Rebels": ["Mississippi", "Mississippi Rebels"],
    "Miami Hurricanes": ["Miami (FL)", "Miami FL", "Miami Florida", "The U"],
    "Miami (OH) RedHawks": ["Miami (OH)", "Miami Ohio", "Miami RedHawks", "Miami of Ohio"],
    "Pittsburgh Panthers": ["Pitt", "Pitt Panthers"],
    "USC Trojans": ["Southern California", "Southern California Trojans", "Southern Cal"],
    "UConn Huskies": ["Connecticut", "Connecticut Huskies"],
    "Massachusetts Minutemen": ["UMass Minutemen", "Massachusetts"],
    "Hawai'i Rainbow Warriors": ["Hawaii", "Hawaii Rainbow Warriors"],
    "San José State Spartans": ["San Jose State", "San Jose State Spartans"],
    "NC State Wolfpack": ["North Carolina State", "North Carolina State Wolfpack"],
    "App State Mountaineers": ["Appalachian State", "Appalachian State Mountaineers"],
    "Florida International Panthers": ["FIU", "FIU Panthers"],
    "Florida Atlantic Owls": ["FAU", "FAU Owls"],
    "UL Monroe Warhawks": ["Louisiana Monroe", "Louisiana-Monroe", "Louisiana-Monroe Warhawks", "ULM"],
    "Louisiana Ragin' Cajuns": ["Louisiana Lafayette", "Louisiana-Lafayette", "Louisiana Ragin Cajuns", "UL Lafayette"],
    "Southern Miss Golden Eagles": ["Southern Mississippi", "Southern Mississippi Golden Eagles"],
    "Jacksonville State Gamecocks": ["Jax State Gamecocks"],
    "Western Kentucky Hilltoppers": ["WKU", "WKU Hilltoppers"],
    "Middle Tennessee Blue Raiders": ["Middle Tennessee State", "Middle Tennessee State Blue Raiders", "MTSU Blue Raiders"],
    "Central Michigan Chippewas": ["CMU"],
    "Eastern Michigan Eagles": ["EMU"],
    "Western Michigan Broncos": ["WMU"],
    "Northern Illinois Huskies": ["NIU"],
    "Georgia Southern Eagles": ["Georgia Southern", "GA Southern Eagles"],
    "UTSA Roadrunners": ["Texas San Antonio", "UT San Antonio"],
    "UTEP Miners": ["Texas El Paso"],
    "UNLV Rebels": ["Nevada Las Vegas", "Nevada-Las Vegas"],
    "UAB Blazers": ["Alabama Birmingham", "Alabama-Birmingham"],
    "UCF Knights": ["Central Florida", "Central Florida Knights"],
    "SMU Mustangs": ["Southern Methodist"],
    "TCU Horned Frogs": ["Texas Christian"],
    "BYU Cougars": ["Brigham Young", "Brigham Young Cougars"],
    "LSU Tigers": ["Louisiana State", "Louisiana State Tigers"],
    "Texas A&M Aggies": ["Texas AM", "Texas A and M", "Texas A&M"],
    "California Golden Bears": ["Cal", "Cal Golden Bears", "California Bears"],
    "Boston College Eagles": ["BC Eagles"],
    "South Florida Bulls": ["USF", "USF Bulls"],
    "Charlotte 49ers": ["Charlotte"],
    "North Dakota State Bison": ["North Dakota St Bison"],
    "Sam Houston Bearkats": ["Sam Houston State", "Sam Houston State Bearkats"],
    "Nevada Wolf Pack": ["Nevada Wolfpack"],
    "Notre Dame Fighting Irish": ["Notre Dame"],
    "Penn State Nittany Lions": ["Penn St"],
  },
  mls: {
    "LA Galaxy": ["Los Angeles Galaxy", "Galaxy"],
    LAFC: ["Los Angeles FC", "Los Angeles", "LA FC"],
    "New York City FC": ["NYCFC", "New York City", "NYC FC"],
    "Red Bull New York": ["New York Red Bulls", "NY Red Bulls", "New York RB", "Red Bulls", "New York Red Bull"],
    "Inter Miami CF": ["Inter Miami", "Miami"],
    "FC Cincinnati": ["Cincinnati"],
    "FC Dallas": ["Dallas"],
    "CF Montréal": ["CF Montreal", "Montreal Impact", "Montréal", "Montreal"],
    "D.C. United": ["DC United", "Washington DC United"],
    "Real Salt Lake": ["RSL", "Salt Lake"],
    "San Jose Earthquakes": ["San Jose"],
    "St. Louis CITY SC": ["St Louis City SC", "St. Louis City", "St. Louis", "Saint Louis City"],
    "Seattle Sounders FC": ["Seattle Sounders", "Seattle"],
    "Sporting Kansas City": ["Sporting KC", "Kansas City"],
    "Vancouver Whitecaps": ["Vancouver Whitecaps FC"],
    "Chicago Fire FC": ["Chicago Fire"],
    "Houston Dynamo FC": ["Houston Dynamo"],
    "Minnesota United FC": ["Minnesota United", "Minnesota"],
    "Orlando City SC": ["Orlando City", "Orlando"],
    "Atlanta United FC": ["Atlanta United", "Atlanta"],
    "Nashville SC": ["Nashville"],
    "New England Revolution": ["New England"],
    "Philadelphia Union": ["Philadelphia"],
    "Portland Timbers": ["Portland"],
    "San Diego FC": ["San Diego"],
    "Toronto FC": ["Toronto"],
    "Austin FC": ["Austin"],
    "Columbus Crew": ["Columbus"],
    "Charlotte FC": ["Charlotte"],
    "Colorado Rapids": ["Colorado"],
  },
}

type Index = Map<string, LeagueTeam>

function buildIndex(sport: LeagueSport, rows: TeamRow[]): Index {
  const teams = rows.map(([name, abbr, color, alt, key, short]) => ({
    team: {
      name,
      abbr,
      color: pickColor(color, alt),
      logo: logoUrl(sport, key),
      logoDark: logoUrl(sport, key, true),
      short,
    } satisfies LeagueTeam,
    short,
  }))
  const byName = new Map(teams.map((t) => [t.team.name, t.team]))
  const index: Index = new Map()
  const claimed = new Set<string>()

  // Exact tier: full name, short name and aliases. First claim wins; a clash between two teams here is a data bug
  // that the tests catch, so later claimants are simply ignored.
  const claim = (raw: string, team: LeagueTeam) => {
    const k = normName(raw)
    if (k && !index.has(k)) {
      index.set(k, team)
      claimed.add(k)
    }
  }
  for (const { team } of teams) claim(team.name, team)
  for (const { team, short } of teams) if (short) claim(short, team)
  for (const [name, aliases] of Object.entries(ALIASES[sport])) {
    const team = byName.get(name)
    if (team) for (const a of aliases) claim(a, team)
  }

  // Derived tier: suffixes ("buckeyes") and nickname-less prefixes ("ohio state"), only when exactly one team yields
  // the key and no exact-tier name already owns it. Ambiguous ones ("tigers", "los angeles") stay unresolved.
  const derived = new Map<string, Set<LeagueTeam>>()
  for (const { team } of teams) {
    const words = normName(team.name).split(" ")
    const keys = new Set<string>()
    for (let i = 1; i < words.length; i++) keys.add(words.slice(i).join(" "))
    for (const drop of [1, 2]) if (words.length > drop) keys.add(words.slice(0, words.length - drop).join(" "))
    for (const k of keys) (derived.get(k) ?? derived.set(k, new Set()).get(k)!).add(team)
  }
  for (const [k, set] of derived) if (!claimed.has(k) && set.size === 1) index.set(k, [...set][0]!)
  return index
}

const TABLES: Record<LeagueSport, TeamRow[]> = { nhl: NHL_TEAMS, mlb: MLB_TEAMS, cfb: CFB_TEAMS, mls: MLS_TEAMS }
const INDEXES = new Map<LeagueSport, Index>()

export function isLeagueSport(sport: string | undefined): sport is LeagueSport {
  return sport !== undefined && (LEAGUE_SPORTS as readonly string[]).includes(sport)
}

/** The team a name refers to in this league, or null when unknown or ambiguous. */
export function leagueTeam(sport: LeagueSport, name: string): LeagueTeam | null {
  let index = INDEXES.get(sport)
  if (!index) INDEXES.set(sport, (index = buildIndex(sport, TABLES[sport])))
  return index.get(normName(name)) ?? null
}

export function leagueTeamCount(sport: LeagueSport): number {
  return TABLES[sport].length
}
