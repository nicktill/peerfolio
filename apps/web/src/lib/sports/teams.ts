/** Team identity for the picks UI: abbreviation, brand colours, and the ESPN logo slug. Pure data. */
import { isLeagueSport, leagueTeam } from "./teams-leagues.ts"
import { isSoccer } from "./types.ts"

type Team = { abbr: string; color: string; alt?: string; slug?: string }

const NFL: Record<string, Team> = {
  "arizona cardinals": { abbr: "ARI", color: "#97233f", alt: "#000000" },
  "atlanta falcons": { abbr: "ATL", color: "#a71930", alt: "#000000" },
  "baltimore ravens": { abbr: "BAL", color: "#241773", alt: "#9e7c0c" },
  "buffalo bills": { abbr: "BUF", color: "#00338d", alt: "#c60c30" },
  "carolina panthers": { abbr: "CAR", color: "#0085ca", alt: "#101820" },
  "chicago bears": { abbr: "CHI", color: "#0b162a", alt: "#c83803" },
  "cincinnati bengals": { abbr: "CIN", color: "#fb4f14", alt: "#000000" },
  "cleveland browns": { abbr: "CLE", color: "#311d00", alt: "#ff3c00" },
  "dallas cowboys": { abbr: "DAL", color: "#003594", alt: "#869397" },
  "denver broncos": { abbr: "DEN", color: "#fb4f14", alt: "#002244" },
  "detroit lions": { abbr: "DET", color: "#0076b6", alt: "#b0b7bc" },
  "green bay packers": { abbr: "GB", color: "#203731", alt: "#ffb612" },
  "houston texans": { abbr: "HOU", color: "#03202f", alt: "#a71930" },
  "indianapolis colts": { abbr: "IND", color: "#002c5f", alt: "#a2aaad" },
  "jacksonville jaguars": { abbr: "JAX", color: "#006778", alt: "#d7a22a" },
  "kansas city chiefs": { abbr: "KC", color: "#e31837", alt: "#ffb81c" },
  "las vegas raiders": { abbr: "LV", color: "#000000", alt: "#a5acaf" },
  "los angeles chargers": { abbr: "LAC", color: "#0080c6", alt: "#ffc20e" },
  "los angeles rams": { abbr: "LAR", color: "#003594", alt: "#ffa300" },
  "miami dolphins": { abbr: "MIA", color: "#008e97", alt: "#fc4c02" },
  "minnesota vikings": { abbr: "MIN", color: "#4f2683", alt: "#ffc62f" },
  "new england patriots": { abbr: "NE", color: "#002244", alt: "#c60c30" },
  "new orleans saints": { abbr: "NO", color: "#d3bc8d", alt: "#101820" },
  "new york giants": { abbr: "NYG", color: "#0b2265", alt: "#a71930" },
  "new york jets": { abbr: "NYJ", color: "#125740", alt: "#000000" },
  "philadelphia eagles": { abbr: "PHI", color: "#004c54", alt: "#a5acaf" },
  "pittsburgh steelers": { abbr: "PIT", color: "#ffb612", alt: "#101820" },
  "san francisco 49ers": { abbr: "SF", color: "#aa0000", alt: "#b3995d" },
  "seattle seahawks": { abbr: "SEA", color: "#002244", alt: "#69be28" },
  "tampa bay buccaneers": { abbr: "TB", color: "#d50a0a", alt: "#34302b" },
  "tennessee titans": { abbr: "TEN", color: "#0c2340", alt: "#4b92db" },
  "washington commanders": { abbr: "WAS", color: "#5a1414", alt: "#ffb612" },
}

const NBA: Record<string, Team> = {
  "atlanta hawks": { abbr: "ATL", color: "#e03a3e" },
  "boston celtics": { abbr: "BOS", color: "#007a33" },
  "brooklyn nets": { abbr: "BKN", color: "#1d1d1b" },
  "charlotte hornets": { abbr: "CHA", color: "#1d1160" },
  "chicago bulls": { abbr: "CHI", color: "#ce1141" },
  "cleveland cavaliers": { abbr: "CLE", color: "#860038" },
  "dallas mavericks": { abbr: "DAL", color: "#00538c" },
  "denver nuggets": { abbr: "DEN", color: "#0e2240" },
  "detroit pistons": { abbr: "DET", color: "#c8102e" },
  "golden state warriors": { abbr: "GS", color: "#1d428a" },
  "houston rockets": { abbr: "HOU", color: "#ce1141" },
  "indiana pacers": { abbr: "IND", color: "#002d62" },
  "los angeles clippers": { abbr: "LAC", color: "#c8102e" },
  "los angeles lakers": { abbr: "LAL", color: "#552583" },
  "memphis grizzlies": { abbr: "MEM", color: "#5d76a9" },
  "miami heat": { abbr: "MIA", color: "#98002e" },
  "milwaukee bucks": { abbr: "MIL", color: "#00471b" },
  "minnesota timberwolves": { abbr: "MIN", color: "#0c2340" },
  "new orleans pelicans": { abbr: "NO", color: "#0c2340" },
  "new york knicks": { abbr: "NY", color: "#006bb6" },
  "oklahoma city thunder": { abbr: "OKC", color: "#007ac1" },
  "orlando magic": { abbr: "ORL", color: "#0077c0" },
  "philadelphia 76ers": { abbr: "PHI", color: "#006bb6" },
  "phoenix suns": { abbr: "PHX", color: "#e56020" },
  "portland trail blazers": { abbr: "POR", color: "#e03a3e" },
  "sacramento kings": { abbr: "SAC", color: "#5a2d81" },
  "san antonio spurs": { abbr: "SA", color: "#8a8d8f" },
  "toronto raptors": { abbr: "TOR", color: "#ce1141" },
  "utah jazz": { abbr: "UTA", color: "#4e008e" },
  "washington wizards": { abbr: "WAS", color: "#002b5c" },
}

const NEUTRAL = "#64748b"

/** `logo` suits a white square (the default badge); `logoDark` is ESPN's variant for a bare logo on a dark background. */
export type TeamLook = { abbr: string; color: string; logo: string | null; logoDark?: string | null; alternate?: string }

/** Look up a team by sport and full name; unknown names (and tennis players) get initials on a neutral colour. */
export function teamLook(sport: string | undefined, name: string): TeamLook {
  if (isLeagueSport(sport)) {
    const t = leagueTeam(sport, name)
    if (t) return { abbr: t.abbr, color: t.color, logo: t.logo, logoDark: t.logoDark, alternate: t.alternate }
  }
  const key = name.trim().toLowerCase()
  const table = sport === "nfl" ? NFL : sport === "nba" ? NBA : null
  // Full name first ("boston celtics"), then the nickname alone ("celtics"), which is how the sample league and some feeds write it.
  const hit = table?.[key] ?? (table ? Object.entries(table).find(([full]) => full.endsWith(` ${key}`))?.[1] : undefined)
  if (hit && (sport === "nfl" || sport === "nba")) {
    return { abbr: hit.abbr, color: hit.color, alternate: hit.alt, logo: `https://a.espncdn.com/i/teamlogos/${sport}/500/${hit.abbr.toLowerCase()}.png`, logoDark: `https://a.espncdn.com/i/teamlogos/${sport}/500-dark/${hit.abbr.toLowerCase()}.png` }
  }
  const words = name.trim().split(/\s+/)
  const abbr = (words.length > 1 ? words[0]![0]! + words[words.length - 1]![0]! : name.slice(0, 2)).toUpperCase()
  return { abbr, color: NEUTRAL, logo: null }
}

/**
 * The word or phrase under a win-chance bar. The last word of the name for most teams ("Celtics", "Bruins", "Sinner"),
 * but MLS clubs often end in a bare suffix ("Inter Miami CF", "Seattle Sounders FC"), so they use the table's short name.
 */
export function oddsLabel(sport: string | undefined, name: string): string {
  if (isSoccer(sport) && isLeagueSport(sport)) {
    const t = leagueTeam(sport, name)
    if (t) return t.short
  }
  return name.trim().split(/\s+/).pop() ?? name
}

/** Readable text colour on a team colour. */
export function onColor(hex: string): "#fff" | "#101418" {
  const n = parseInt(hex.slice(1), 16)
  const lum = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255
  return lum > 0.62 ? "#101418" : "#fff"
}
