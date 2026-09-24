import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, plaidItems } from "@web/db"
import { withUser } from "@web/lib/api"

/** Connected institutions for the signed-in user. Never includes tokens. */
export const GET = withUser<unknown>(async (userId) => {
  const rows = await db.query.plaidItems.findMany({
    where: eq(plaidItems.userId, userId),
    with: { accounts: true },
  })

  return NextResponse.json({
    items: rows
      .filter((item) => item.status !== "disconnected")
      .map((item) => ({
        id: item.id,
        institutionName: item.institutionName,
        institutionLogo: item.institutionLogo,
        status: item.status,
        errorCode: item.errorCode,
        lastSyncedAt: item.lastSyncedAt,
        accountCount: item.accounts.filter((a) => a.isActive).length,
      })),
  })
})
