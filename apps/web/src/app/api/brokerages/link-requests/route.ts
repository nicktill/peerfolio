import { NextResponse } from "next/server"
import { and, eq } from "drizzle-orm"
import { z } from "zod"
import { brokerageLinkRequests, db } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { cleanRequestNote } from "@web/lib/plaid-access-core"
import { getBrokerageAccess } from "@web/lib/plaid-access"

const openRequest = (userId: string) => and(eq(brokerageLinkRequests.userId, userId), eq(brokerageLinkRequests.status, "open"))

/** Whether this user already has an open request, so the link can read "Requested". */
export const GET = withUser<unknown>(async (userId) => {
  const row = await db.query.brokerageLinkRequests.findFirst({ where: openRequest(userId), columns: { id: true } })
  return NextResponse.json({ requested: Boolean(row) })
})

const Body = z.object({ note: z.string().max(2000).nullish() }).strict()

export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = Body.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Expected an optional note", 400)
  const access = await getBrokerageAccess(userId)
  // Only people stopped by the per-user cap or a full pool have anything to ask for.
  if (access.code !== "user_limit" && access.code !== "full") throw new ApiError("You can still connect an account.", 409)
  // The partial unique index makes a second open request a no-op instead of an error.
  await db.insert(brokerageLinkRequests)
    .values({ userId, note: cleanRequestNote(parsed.data.note), usedAtRequest: access.userLimit.used })
    .onConflictDoNothing()
  return NextResponse.json({ requested: true })
})
