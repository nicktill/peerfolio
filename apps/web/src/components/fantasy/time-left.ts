/** "3d left", "5h left", "Ends soon". Coarse on purpose: this is a scoreboard, not a timer. */
export function timeLeft(endsAt: string | Date, now = Date.now()): string {
  const ms = new Date(endsAt).getTime() - now
  if (ms <= 0) return "Final"
  const hours = ms / 3_600_000
  if (hours < 1) return "Ends soon"
  if (hours < 48) return `${Math.floor(hours)}h left`
  return `${Math.floor(hours / 24)}d left`
}
