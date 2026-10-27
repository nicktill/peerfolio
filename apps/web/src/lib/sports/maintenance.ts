/**
 * A temporary hold on the whole sports feature while the database is kept inside its monthly allowance. From the
 * moment this ships until `SPORTS_HOLD_UNTIL`, sports pages show the leagues greyed out with `SPORTS_HOLD_MESSAGE`,
 * sports routes answer before touching the database, the publish and settle crons skip, and the live odds worker
 * exits at start. Nothing is deleted: leagues, picks and balances wait, and open picks settle once the hold lifts.
 *
 * It lifts by itself at `SPORTS_HOLD_UNTIL` (the start of the next database billing period). Setting
 * NEXT_PUBLIC_SPORTS_HOLD=off and redeploying lifts it early (Next inlines the value into the client too).
 * Pure: shared by the routes, the client UI and the worker script.
 */
export const SPORTS_HOLD_UNTIL = new Date("2026-11-01T00:00:00Z")

export const SPORTS_HOLD_MESSAGE = "Sports is paused until November 1 for a developer update. Your leagues, picks and balances are saved."

export function sportsOnHold(now: number = Date.now(), override: string | undefined = process.env.NEXT_PUBLIC_SPORTS_HOLD): boolean {
  if (override?.trim().toLowerCase() === "off") return false
  return now < SPORTS_HOLD_UNTIL.getTime()
}
