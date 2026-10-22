/**
 * Shared wake slots for everything that touches the database while no game is near. Neon suspends after five idle minutes, so
 * separate timers (worker passes, the publish and settle routes) each cost a full five awake minutes; when they all fire in the
 * same slot they share one. Slots sit on quarter-hour boundaries, shifted by SLOT_OFFSET_MS so the worker runs just after the
 * cron routes that fire on the boundary.
 */
export const SLOT_MS = 15 * 60_000
export const SLOT_OFFSET_MS = 45_000

/** Milliseconds from `now` to the next slot (always positive). */
export const msToNextSlot = (now: number): number => SLOT_MS - ((now - SLOT_OFFSET_MS) % SLOT_MS + SLOT_MS) % SLOT_MS

/** True when a slot boundary lies in (last, now]. */
export const slotElapsed = (last: number, now: number): boolean => Math.floor((now - SLOT_OFFSET_MS) / SLOT_MS) > Math.floor((last - SLOT_OFFSET_MS) / SLOT_MS)
