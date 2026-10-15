import { NextResponse } from "next/server"
import { and, eq, sql } from "drizzle-orm"
import { accounts, db } from "@web/db"
import { withUser } from "@web/lib/api"

/**
 * What the assistant can currently see, as counts only: how many of the
 * person's open accounts are linked through an institution and how many were
 * added by hand. No names, balances or tokens leave the server here.
 */
export const GET = withUser<unknown>(async (userId) => {
  const rows = await db
    .select({ source: accounts.source, n: sql<number>`count(*)::int` })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))
    .groupBy(accounts.source)
  const count = (source: string) => rows.find((r) => r.source === source)?.n ?? 0
  return NextResponse.json({ linked: count("plaid"), manual: count("manual") })
})
