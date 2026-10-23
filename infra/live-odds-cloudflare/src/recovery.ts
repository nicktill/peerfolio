/** Host supervisor: failures remain visible and always schedule another bounded attempt. */
export function nextRecovery(previous: number, now: number, error: unknown) {
  const failures = Math.min(1000, Math.max(0, previous) + 1)
  const delayMs = Math.min(15 * 60_000, 30_000 * 2 ** Math.min(failures - 1, 5))
  return {
    failures,
    nextDue: now + delayMs,
    error: String(error).slice(0, 500),
    at: now,
  }
}
