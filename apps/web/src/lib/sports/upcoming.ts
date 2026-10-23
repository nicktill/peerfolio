/** Matches the pregame publication window; distant schedules stay off the pick screen. */
export const UPCOMING_WINDOW_MS = 24 * 3600_000
export const UPCOMING_PAGE_SIZE = 12

export function isUpcoming(startsAt: string, now: number): boolean {
  const starts = Date.parse(startsAt)
  return starts > now && starts <= now + UPCOMING_WINDOW_MS
}

/** One limit for the whole list, with a selected game kept visible while its slip is open. */
export function upcomingPage<T>(games: readonly T[], limit: number, holdsSelection: (game: T) => boolean): T[] {
  return games.filter((game, index) => index < limit || holdsSelection(game))
}

/** Tennis times are “not before”; a short delay must not make the match vanish. */
export function isComingUp(game: { startsAt: string; sport: string }, now: number): boolean {
  const starts = Date.parse(game.startsAt)
  return isUpcoming(game.startsAt, now) || (game.sport === "tennis" && starts <= now && now - starts < 5 * 3600_000)
}
