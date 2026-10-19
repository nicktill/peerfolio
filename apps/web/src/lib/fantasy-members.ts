import "server-only"
import { and, eq, inArray } from "drizzle-orm"
import { db, fantasyTrades, fantasyOrders } from "@web/db"

/** Members who have bought something in their league, or have a buy waiting for the open. */
export async function loadBuyers(memberIds: string[], source: Pick<typeof db, "selectDistinct"> = db): Promise<Set<string>> {
  if (memberIds.length === 0) return new Set()
  const [trades, orders] = await Promise.all([
    source.selectDistinct({ id: fantasyTrades.memberId }).from(fantasyTrades).where(and(inArray(fantasyTrades.memberId, memberIds), eq(fantasyTrades.side, "buy"))),
    source
      .selectDistinct({ id: fantasyOrders.memberId })
      .from(fantasyOrders)
      .where(and(inArray(fantasyOrders.memberId, memberIds), eq(fantasyOrders.side, "buy"), eq(fantasyOrders.status, "pending"))),
  ])
  return new Set([...trades, ...orders].map((r) => r.id))
}

