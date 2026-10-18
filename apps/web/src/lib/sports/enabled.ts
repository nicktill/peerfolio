/**
 * The one switch for pausing a sport. SPORTS_DISABLED is a comma list of sport keys.
 *
 *   unset                 -> DEFAULT_DISABLED (tennis is paused)
 *   SPORTS_DISABLED=""    -> nothing paused (also "none")
 *   SPORTS_DISABLED=nhl   -> only the NHL paused
 *
 * Paused means: no new listing, publishing, live pricing or picking. Settlement and result polling for
 * events that already have picks are NOT affected, and open markets are never voided because of it.
 * No imports on purpose: the live worker and client-bound code can load this file.
 */
export const DEFAULT_DISABLED = "tennis"

const LABELS: Record<string, string> = { nfl: "NFL", nba: "NBA", tennis: "Tennis", nhl: "NHL", mlb: "MLB", cfb: "College football", mls: "MLS" }

/** The paused sport keys for a raw env value (pass `process.env.SPORTS_DISABLED`). */
export function disabledSports(raw: string | undefined = process.env.SPORTS_DISABLED): Set<string> {
  const value = raw === undefined ? DEFAULT_DISABLED : raw
  return new Set(value.toLowerCase().split(/[\s,]+/).filter((s) => s && s !== "none"))
}

export function isSportEnabled(sport: string, raw?: string): boolean {
  return !disabledSports(raw).has(sport.toLowerCase())
}

/** `list` without the paused sports, order kept. */
export function enabledSports<T extends string>(list: readonly T[], raw?: string): T[] {
  const off = disabledSports(raw)
  return list.filter((s) => !off.has(s))
}

export const sportLabel = (sport: string): string => LABELS[sport] ?? sport.toUpperCase()

/** The message shown when someone tries to pick on a paused sport. */
export const pausedMessage = (sport: string): string => `${sportLabel(sport)} is paused`
