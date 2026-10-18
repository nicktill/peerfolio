import { SPORTS, type Sport } from "./types.ts"

/**
 * Sports feature flag, read from one NEXT_PUBLIC variable so the same value is visible to the server routes and the
 * client UI (Next inlines it at build time):
 *   "1"     on for everyone
 *   "admin" on only for signed-in administrators and users an admin granted access to; everyone else sees nothing
 *   other   off (the default)
 * Who is an admin is never decided here or on the client: see `sportsAllowed` and /api/sports/access.
 */
export type SportsMode = "off" | "all" | "admin"

export function parseSportsMode(value: string | undefined): SportsMode {
  const v = value?.trim().toLowerCase()
  return v === "1" ? "all" : v === "admin" ? "admin" : "off"
}

export const sportsMode = (): SportsMode => parseSportsMode(process.env.NEXT_PUBLIC_SPORTS_ENABLED)

/** True when sports is on for at least some users (everyone, or admins only). */
export const sportsEnabled = (): boolean => sportsMode() !== "off"

/** The pure access rule: off is never, all is always, admin needs a signed-in admin or granted user (the callback decides). */
export async function sportsAllowed(mode: SportsMode, userId: string | null, isAdmin: (userId: string) => Promise<boolean>): Promise<boolean> {
  if (mode === "off") return false
  if (mode === "all") return true
  return userId ? isAdmin(userId) : false
}

/**
 * Men's college basketball is fully wired (ESPN, exchange matching, settlement, teams) but its season runs November to April, so
 * it sits behind one switch. NEXT_PUBLIC_SPORTS_NCAAB_ENABLED=1 turns it on everywhere at once: the league creation list and API,
 * the publish cron and the scoreboard strip. Off (the default), nothing new is fetched or offered. Settlement and the scoreboard
 * route keep recognising it, so a league or pick that already uses it still settles.
 */
export const ncaabEnabled = (): boolean => process.env.NEXT_PUBLIC_SPORTS_NCAAB_ENABLED?.trim() === "1"

/** Sports that may be offered and published right now: all of SPORTS, minus those behind a flag that is off. */
export const activeSports = (): Sport[] => SPORTS.filter((s) => s !== "ncaab" || ncaabEnabled())
