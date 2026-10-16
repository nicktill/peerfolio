/** Plain formatting for the season screens. No React, so the tests run it directly. */

const MIN = 60_000
const HOUR = 3_600_000
const DAY = 86_400_000

/** "2d 4h", "5h 12m", "12m". Two units at most: it is a clock, not a stopwatch. */
export function formatCountdown(ms: number): string {
  if (ms <= 0) return "now"
  if (ms < MIN) return "under 1m"
  const days = Math.floor(ms / DAY)
  const hours = Math.floor((ms % DAY) / HOUR)
  const minutes = Math.floor((ms % HOUR) / MIN)
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`
  return `${minutes}m`
}

/** How far through a round the clock is, 0 to 1. */
export function roundProgress(startsAt: string, endsAt: string, now = Date.now()): number {
  const [from, to] = [new Date(startsAt).getTime(), new Date(endsAt).getTime()]
  if (!(to > from)) return 0
  return Math.min(1, Math.max(0, (now - from) / (to - from)))
}

/** "Sun 8:00 PM", in the viewer's own time zone. */
export function formatDeadline(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })
}

/** "Mon, Oct 19". */
export function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
}

/** "Draft, 5 picks, 4 rounds" or "Trading, open-ended". */
export function describeSeason(season: { mode: "trading" | "draft"; roundCount: number | null; picksPerRound: number | null }): string {
  const rounds = season.roundCount === null ? "open-ended" : `${season.roundCount} ${season.roundCount === 1 ? "round" : "rounds"}`
  return season.mode === "draft" ? `Draft / ${season.picksPerRound ?? 5} picks / ${rounds}` : `Trading / ${rounds}`
}

/** "1st", "2nd", "3rd", "4th", "11th". */
export function ordinal(n: number): string {
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  return `${n}${({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th"}`
}

/** "2-1" or "2-1-1" when there are ties. */
export function formatRecord(r: { wins: number; losses: number; ties: number }): string {
  return r.ties > 0 ? `${r.wins}-${r.losses}-${r.ties}` : `${r.wins}-${r.losses}`
}

/** Points without a trailing ".0": 7, 3.5. */
export function formatPoints(points: number): string {
  return Number.isInteger(points) ? String(points) : points.toFixed(1)
}
