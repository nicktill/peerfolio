/**
 * "Up 2 since you last looked": the part of a leaderboard that brings people
 * back. Pure so it can be tested; the browser storage wrapper lives next to the
 * component that uses it.
 */

/** Positive means you moved up (a smaller rank number). Null when there's nothing to compare. */
export function rankMovement(previous: number | null | undefined, current: number): number | null {
  if (previous == null || !Number.isFinite(previous) || previous < 1) return null
  const moved = previous - current
  return moved === 0 ? null : moved
}

/** What to say about a movement, e.g. "Up 2" or "Down 1". */
export function describeMovement(moved: number | null): string | null {
  if (moved === null) return null
  return `${moved > 0 ? "Up" : "Down"} ${Math.abs(moved)}`
}
