import { regularSession } from "./market-hours.ts"
export type NewsSlot = "morning" | "close"
export function nyMinutes(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "numeric", hourCycle: "h23" }).formatToParts(now)
  return Number(parts.find(p => p.type === "hour")?.value) * 60 + Number(parts.find(p => p.type === "minute")?.value)
}
/** Two UTC schedules per slot cover DST. Only the matching local-hour window runs. */
export function scheduledNewsSlot(now: Date, slot: string): NewsSlot | null {
  if (!regularSession(now)) return null
  const minutes = nyMinutes(now)
  if (slot === "morning" && minutes >= 660 && minutes < 720) return "morning"
  if (slot === "close" && minutes >= 990 && minutes < 1050) return "close"
  return null
}
export function canPublishDaily(slot: NewsSlot, existing: Date | null, date: string) {
  if (!existing) return true
  const existingDate = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(existing)
  return slot === "close" && existingDate === date && nyMinutes(existing) < 990
}
