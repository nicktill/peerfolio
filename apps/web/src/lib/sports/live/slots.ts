/**
 * Shared wake slots for everything that touches the database while no game is near. Neon suspends after five idle minutes, so
 * separate timers (worker passes, the publish and settle routes) each cost a full five awake minutes; when they all fire in the
 * same slot they share one. Slots sit on quarter-hour boundaries, shifted by SLOT_OFFSET_MS so the worker runs just after the
 * cron routes that fire on the boundary.
 *
 * Quiet hours (UTC, SPORTS_QUIET_HOURS_UTC, default 5-15, "off" disables): nobody is usually on and few games start or end, so
 * the shared slot widens to the hour. The routes skip the other quarter-hours (quietOffSlot) and the worker sleeps to the hour,
 * but only when no game starts within the repricing window plus an hour (callers pass `hourly`). Set the variable to the same
 * value on Vercel and on the worker, or leave it unset on both.
 */
export const SLOT_MS = 15 * 60_000
export const SLOT_OFFSET_MS = 45_000
export const QUIET_SLOT_MS = 60 * 60_000

const DEFAULT_QUIET = "5-15"

export type QuietHours = [start: number, end: number] | null

/** `start-end` in whole UTC hours, end exclusive (may wrap past midnight). "off" or anything malformed means no quiet hours. */
export function parseQuietHours(spec: string | undefined): QuietHours {
  const m = /^(\d{1,2})-(\d{1,2})$/.exec((spec ?? DEFAULT_QUIET).trim())
  if (!m) return null
  const start = Number(m[1])
  const end = Number(m[2])
  return start <= 23 && end <= 24 && start !== end ? [start, end] : null
}

const QUIET = parseQuietHours(process.env.SPORTS_QUIET_HOURS_UTC)

export function inQuietHours(t: number, quiet: QuietHours = QUIET): boolean {
  if (!quiet) return false
  const h = new Date(t).getUTCHours()
  const [start, end] = quiet
  return start < end ? h >= start && h < end : h >= start || h < end
}

/** A quarter-hour cron run the publish and settle routes skip: inside quiet hours and not the top of the hour. */
export const quietOffSlot = (now: number, quiet: QuietHours = QUIET): boolean => inQuietHours(now, quiet) && new Date(now).getUTCMinutes() >= 15

const isSlot = (b: number, hourly: boolean, quiet: QuietHours) => !hourly || !inQuietHours(b - SLOT_OFFSET_MS, quiet) || (b - SLOT_OFFSET_MS) % QUIET_SLOT_MS === 0

/** The first slot strictly after `t`. With `hourly`, quarter-hours inside quiet hours other than the top of the hour are not slots. */
function nextSlotAfter(t: number, hourly: boolean, quiet: QuietHours): number {
  let b = Math.floor((t - SLOT_OFFSET_MS) / SLOT_MS) * SLOT_MS + SLOT_OFFSET_MS + SLOT_MS
  while (!isSlot(b, hourly, quiet)) b += SLOT_MS
  return b
}

/** Milliseconds from `now` to the next slot (always positive). */
export const msToNextSlot = (now: number, hourly = false, quiet: QuietHours = QUIET): number => nextSlotAfter(now, hourly, quiet) - now

/** True when a slot boundary lies in (last, now]. */
export const slotElapsed = (last: number, now: number, hourly = false, quiet: QuietHours = QUIET): boolean => nextSlotAfter(last, hourly, quiet) <= now
