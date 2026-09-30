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
