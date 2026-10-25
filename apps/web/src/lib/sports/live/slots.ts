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
 *
 * Half-hour band (inHalfHourBand): outside quiet hours, the hours when nothing but sports would wake the database on the quarter
 * hour (no stock price slots: weekends, and weekday nights 01-05 UTC). There the routes run on the half hour and the worker's
 * relaxed passes (nobody watching, or no game near) follow it; a viewer still gets the fast cadence. SPORTS_HALF_HOURLY=off turns
 * it off; set it the same on Vercel and the worker.
 *
 * `hourly` below means "relaxed": the slot widens to the hour in quiet hours and to the half hour in the half-hour band.
 */
export const SLOT_MS = 15 * 60_000
export const SLOT_OFFSET_MS = 45_000
export const QUIET_SLOT_MS = 60 * 60_000
export const HALF_SLOT_MS = 30 * 60_000

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

const HALF = process.env.SPORTS_HALF_HOURLY?.trim().toLowerCase() !== "off"

/**
 * Outside quiet hours, the sports-only hours (UTC): Saturday and Sunday, except Saturday 00:00-01:00 (Friday evening's stock price
 * runs still fire every quarter hour then), and weekday nights 01:00-05:00, after the price slots stop.
 */
export function inHalfHourBand(t: number, quiet: QuietHours = QUIET, half: boolean = HALF): boolean {
  if (!half || inQuietHours(t, quiet)) return false
  const d = new Date(t)
  const dow = d.getUTCDay()
  const h = d.getUTCHours()
  if (dow === 6) return h >= 1
  if (dow === 0) return true
  return h >= 1 && h < 5
}

/**
 * A quarter-hour cron run the publish and settle routes skip: in quiet hours anything but the top of the hour, and in the
 * half-hour band the quarter past and quarter to.
 */
export const quietOffSlot = (now: number, quiet: QuietHours = QUIET, half: boolean = HALF): boolean => {
  const m = new Date(now).getUTCMinutes()
  if (inQuietHours(now, quiet)) return m >= 15
  return inHalfHourBand(now, quiet, half) && m % 30 >= 15
}

function isSlot(b: number, hourly: boolean, quiet: QuietHours, half: boolean): boolean {
  const at = b - SLOT_OFFSET_MS
  if (!hourly) return true
  if (inQuietHours(at, quiet)) return at % QUIET_SLOT_MS === 0
  if (inHalfHourBand(at, quiet, half)) return at % HALF_SLOT_MS === 0
  return true
}

/** The first slot strictly after `t`. With `hourly` (relaxed), quiet hours keep only the top of the hour and the half-hour band only :00 and :30. */
function nextSlotAfter(t: number, hourly: boolean, quiet: QuietHours, half: boolean): number {
  let b = Math.floor((t - SLOT_OFFSET_MS) / SLOT_MS) * SLOT_MS + SLOT_OFFSET_MS + SLOT_MS
  while (!isSlot(b, hourly, quiet, half)) b += SLOT_MS
  return b
}

/** Milliseconds from `now` to the next slot (always positive). */
export const msToNextSlot = (now: number, hourly = false, quiet: QuietHours = QUIET, half: boolean = HALF): number => nextSlotAfter(now, hourly, quiet, half) - now

/** True when a slot boundary lies in (last, now]. */
export const slotElapsed = (last: number, now: number, hourly = false, quiet: QuietHours = QUIET, half: boolean = HALF): boolean => nextSlotAfter(last, hourly, quiet, half) <= now
