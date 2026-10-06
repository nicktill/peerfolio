import { sql } from "drizzle-orm"
import { securities } from "@web/db"

/**
 * The value `previous_close` should take when a price dated `newAsOf` replaces
 * the stored one: the close we're about to overwrite, so "today's change" has
 * something to be measured against. When the stored price is from the same day
 * (a live price replaced by that day's official close) the earlier previous
 * close still stands.
 */
export const previousCloseOnUpdate = (newAsOf: string) =>
  sql`CASE WHEN ${securities.closePriceAsOf} < ${newAsOf}::date THEN ${securities.closePrice} ELSE ${securities.previousClose} END`


/** Date first; an official close wins the same session. Live prints are
 * ordered by their provider timestamp, never by queue/check timestamps. */
export function acceptsPrice(asOf: string, final: boolean, printedAt: Date | null = null) {
  const printed = printedAt?.toISOString() ?? null
  return sql`(${securities.closePrice} IS NULL OR ${securities.closePriceAsOf} IS NULL
    OR ${securities.closePriceAsOf} < ${asOf}::date
    OR (${securities.closePriceAsOf} = ${asOf}::date AND (
      (${final} AND NOT ${securities.closePriceFinal})
      OR (${final} AND ${securities.closePriceFinal})
      OR (NOT ${final} AND NOT ${securities.closePriceFinal}
        AND ${printed}::timestamptz IS NOT NULL
        AND (${securities.quotePrintedAt} IS NULL OR ${securities.quotePrintedAt} < ${printed}::timestamptz))
    )))`
}
