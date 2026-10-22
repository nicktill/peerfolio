import { sql } from "drizzle-orm"
import { sportsEvents } from "../../db/schema.ts"

/** Sports offered by an unfinished league with members. Existing pick obligations are handled separately. */
export function leagueSportsSql(now: Date) {
  return sql`SELECT DISTINCT jsonb_array_elements_text(l.sports) AS sport
    FROM sports_leagues l
    WHERE (l.ends_at IS NULL OR l.ends_at > ${now.toISOString()}::timestamptz)
      AND EXISTS (SELECT 1 FROM sports_members member WHERE member.league_id = l.id)`
}

/** Keep observations for current league offerings AND outstanding picks, even after league expiry/settings changes. */
export function trackedEventSql(now: Date) {
  return sql`(
    ${sportsEvents.sport} IN (${leagueSportsSql(now)})
    OR EXISTS (
      SELECT 1 FROM sports_markets market
      JOIN sports_picks pick ON pick.market_id = market.id
      WHERE market.event_id = ${sportsEvents.id} AND pick.status = 'open'
    )
    OR EXISTS (
      SELECT 1 FROM sports_parlay_legs leg
      JOIN sports_parlays parlay ON parlay.id = leg.parlay_id
      WHERE leg.event_id = ${sportsEvents.id} AND leg.status = 'open' AND parlay.status = 'open'
    )
  )`
}
