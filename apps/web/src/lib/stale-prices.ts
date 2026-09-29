import { and, isNotNull, lt, sql } from "drizzle-orm"
import { securities } from "../db/schema.ts"

/**
 * Securities someone holds (a real position or a fantasy pick) whose price
 * hasn't been checked since `cutoff`.
 *
 * The cutoff goes through `lt()` on the column rather than a raw `sql` template:
 * a bare `Date` interpolated into `sql` reaches the driver unserialised and the
 * whole query fails. That took the first production refresh down silently, so
 * the test builds this exact clause and checks what would be sent.
 *
 * Kept free of the database client so the tests can import it.
 */
export function staleHeldSecurities(cutoff: Date) {
  return and(
    isNotNull(securities.marketTicker),
    lt(securities.updatedAt, cutoff),
    sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
      OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id}))`,
  )
}
