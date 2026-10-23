import { sql } from "drizzle-orm"
import { sportsEvents } from "../../db/schema.ts"
import { ACTIVITY_NAME, ACTIVITY_WINDOW_MS } from "./live/activity.ts"

/**
 * Sports offered by an unfinished league with members. Existing pick obligations are handled separately.
 * `sports` is read defensively: jsonb_array_elements_text raises on any non-array value ("cannot extract elements from a scalar"),
 * and one such row would fail every worker and cron query. A JSON-encoded array of plain names stored as a string is unwrapped; anything else offers nothing.
 */
export function leagueSportsSql(now: Date) {
  return sql`SELECT DISTINCT jsonb_array_elements_text(
      CASE
        WHEN jsonb_typeof(l.sports) = 'array' THEN l.sports
        WHEN jsonb_typeof(l.sports) = 'string' AND (l.sports #>> '{}') ~ '^[[][[:space:]]*("[a-z0-9_]+"[[:space:]]*(,[[:space:]]*"[a-z0-9_]+"[[:space:]]*)*)?[]]$' THEN (l.sports #>> '{}')::jsonb
        ELSE '[]'::jsonb
      END) AS sport
    FROM sports_leagues l
    WHERE (l.ends_at IS NULL OR l.ends_at > ${now.toISOString()}::timestamptz)
      AND EXISTS (SELECT 1 FROM sports_members member WHERE member.league_id = l.id)`
}

/** An unsettled single or parlay leg rides on the event, so its result must be watched whatever else happens. */
export function pickObligationSql() {
  return sql`(
    EXISTS (
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

/** Keep observations for current league offerings AND outstanding picks, even after league expiry/settings changes. */
export function trackedEventSql(now: Date) {
  return sql`(${sportsEvents.sport} IN (${leagueSportsSql(now)}) OR ${pickObligationSql()})`
}

/** A member has had the sports pages open recently (see live/activity.ts). */
export function sportsWatchedSql(now: Date) {
  return sql`EXISTS (SELECT 1 FROM live_worker activity WHERE activity.name = ${ACTIVITY_NAME} AND activity.last_cycle_at > ${new Date(now.getTime() - ACTIVITY_WINDOW_MS).toISOString()}::timestamptz)`
}

/**
 * Events the live worker follows second by second: tracked ones that someone is watching, or that carry an open pick (those keep
 * their fast settle triggers whether or not anyone is looking). Everything else is left to the settle cron.
 */
export function liveWantedEventSql(now: Date) {
  return sql`(${trackedEventSql(now)} AND (${sportsWatchedSql(now)} OR ${pickObligationSql()}))`
}
