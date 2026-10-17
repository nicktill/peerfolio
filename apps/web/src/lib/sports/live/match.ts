/**
 * Game matching: finds our game inside another feed's list by sport, team names and start time. Feeds disagree on
 * names ("Boston Celtics" vs "Celtics" vs "Boston"), on which team is first, and on start time (cushions,
 * delays), so a match needs BOTH teams and a start time close enough, and an ambiguous result is no result.
 */

export type GameRef = { homeName: string; awayName: string; startsAt: Date }

export type Candidate = {
  id: string
  /** Team names in the feed's listed order. */
  teams: [string, string]
  startsAt: Date | null
}

export type Match<C extends Candidate> = {
  candidate: C
  /** Index into `candidate.teams` of OUR home team. */
  homeIndex: 0 | 1
  /** Absolute start time gap, or null if the candidate has no start time. */
  gapMs: number | null
}

/** Feeds' start times differ by a few minutes to a couple of hours; a different day is a different game. */
export const DEFAULT_TOLERANCE_MS = 3 * 3600_000
/** Two candidates this close in start gap are indistinguishable. */
const AMBIGUOUS_MS = 30 * 60_000

const STOP = new Set(["fc", "the", "of", "de", "la", "afc", "cf", "sc"])

export function normName(s: string): string {
  const base = s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((t) => t && !STOP.has(t))
    .map((t, i, all) => (t === "st" ? (i === all.length - 1 ? "state" : "saint") : t))
    .join(" ")
  return ALIAS[base] ?? base
}

/**
 * Whole-name aliases (after normalisation) for names feeds abbreviate beyond what suffix/prefix matching can bridge:
 * ESPN writes "LAFC" where Polymarket writes "Los Angeles FC", Kalshi truncates to "New York RB" and "Chicago WS".
 * Both sides of a comparison go through this, so each alias only has to name the same team once.
 */
const ALIAS: Record<string, string> = {
  lafc: "los angeles",
  nycfc: "new york city",
  galaxy: "los angeles galaxy",
  "new york rb": "new york red bulls",
  "ny red bulls": "new york red bulls",
  "red bull new york": "new york red bulls",
  "chicago ws": "chicago white sox",
  "utah hc": "utah mammoth",
}

/**
 * Same team? Equal after normalising, or one is a whole-word suffix of the other: "celtics" ends "boston celtics",
 * "djokovic" ends "novak djokovic", "trail blazers" ends "portland trail blazers". Prefix matches (city only) are
 * deliberately NOT accepted, because "Los Angeles" and "New York" name two teams each.
 */
export function sameTeam(a: string, b: string): boolean {
  const x = normName(a)
  const y = normName(b)
  if (!x || !y) return false
  return x === y || x.endsWith(` ${y}`) || y.endsWith(` ${x}`)
}

/**
 * Like {@link sameTeam} but also accepts a leading city/short name ("boston" for "boston celtics"), which is how
 * Kalshi titles NBA games. Only for feeds that name teams that way, and only with uniqueness checks on top:
 * "Los Angeles" fits two teams, so a pairing that fits both orientations is refused by {@link matchGame}.
 */
export function sameTeamLoose(a: string, b: string): boolean {
  if (sameTeam(a, b)) return true
  const x = normName(a)
  const y = normName(b)
  if (!x || !y) return false
  if (x.startsWith(`${y} `) || y.startsWith(`${x} `)) return true
  // Kalshi clips long names to an initial: "New York R", "Los Angeles G". A one-letter last token is a prefix of the full name.
  const clipped = (short: string, full: string) => / \w$/.test(short) && full.startsWith(short)
  return clipped(x, y) || clipped(y, x)
}

export function matchGame<C extends Candidate>(
  ref: GameRef,
  candidates: C[],
  opts: { toleranceMs?: number; requireTime?: boolean; loose?: boolean } = {},
): Match<C> | null {
  const same = opts.loose ? sameTeamLoose : sameTeam
  const tol = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS
  const requireTime = opts.requireTime ?? true
  if (sameTeam(ref.homeName, ref.awayName)) return null

  const found: Match<C>[] = []
  for (const c of candidates) {
    const [t0, t1] = c.teams
    let homeIndex: 0 | 1 | null = null
    const straight = same(ref.homeName, t0) && same(ref.awayName, t1)
    const swapped = same(ref.homeName, t1) && same(ref.awayName, t0)
    // Both orientations fit ("Los Angeles vs Los Angeles"): we cannot tell which side is which, so no match.
    if (straight === swapped) continue
    homeIndex = straight ? 0 : 1
    let gapMs: number | null = null
    if (c.startsAt) {
      gapMs = Math.abs(c.startsAt.getTime() - ref.startsAt.getTime())
      if (gapMs > tol) continue
    } else if (requireTime) continue
    found.push({ candidate: c, homeIndex, gapMs })
  }
  if (found.length === 0) return null
  found.sort((a, b) => (a.gapMs ?? Infinity) - (b.gapMs ?? Infinity))
  if (found.length > 1) {
    const [a, b] = found as [Match<C>, Match<C>]
    // Several open events for one pairing with no time to tell them apart (or too close): refuse rather than guess.
    if (a.gapMs == null || b.gapMs == null || b.gapMs - a.gapMs < AMBIGUOUS_MS) return null
  }
  return found[0]!
}

/** Orients a "first-second" score pair to our home and away. */
export function orientScore(first: number | null, second: number | null, homeIndex: 0 | 1): { home: number | null; away: number | null } {
  return homeIndex === 0 ? { home: first, away: second } : { home: second, away: first }
}

/**
 * Why `matchGame` found nothing, for logs and the health endpoint. Mirrors matchGame's rules but reports the
 * closest miss: no candidates at all, names that fit nowhere, names that fit but at the wrong time, or ambiguity.
 */
export function explainNoMatch(
  ref: GameRef,
  candidates: Candidate[],
  opts: { toleranceMs?: number; requireTime?: boolean; loose?: boolean } = {},
): string {
  if (candidates.length === 0) return "feed_has_no_games"
  const same = opts.loose ? sameTeamLoose : sameTeam
  const tol = opts.toleranceMs ?? DEFAULT_TOLERANCE_MS
  const byName = candidates.filter((c) => {
    const straight = same(ref.homeName, c.teams[0]) && same(ref.awayName, c.teams[1])
    const swapped = same(ref.homeName, c.teams[1]) && same(ref.awayName, c.teams[0])
    return straight !== swapped
  })
  if (byName.length === 0) {
    const oneTeam = candidates.some((c) => c.teams.some((t) => same(ref.homeName, t) || same(ref.awayName, t)))
    return oneTeam ? "only_one_team_matches" : "no_name_match"
  }
  const timed = byName.filter((c) => c.startsAt && Math.abs(c.startsAt.getTime() - ref.startsAt.getTime()) <= tol)
  if (opts.requireTime ?? true) {
    if (timed.length === 0) {
      const gaps = byName.map((c) => (c.startsAt ? Math.round(Math.abs(c.startsAt.getTime() - ref.startsAt.getTime()) / 60000) : null))
      return `time_outside_tolerance(gap_min=${gaps.filter((g) => g != null).join(",") || "no_start_time"})`
    }
    return timed.length > 1 ? "ambiguous_candidates" : "unknown"
  }
  return byName.length > 1 ? "ambiguous_candidates" : "unknown"
}
