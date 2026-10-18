import { NextResponse } from "next/server"
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"
import { brokerageLinkRequests, db, users } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { effectiveUserLimit, parseLinkLimitOverride } from "@web/lib/plaid-access-core"
import { assertAdmin, orphanedPool2Items, productionCapacity } from "@web/lib/plaid-access"
import { trialCredentialSummary } from "@web/lib/plaid-profile"

export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120)
  const [list, capacity, orphanedPool2, requests] = await Promise.all([
    db.select({
      id: users.id, email: users.email, name: users.name, allowed: sql<boolean>`not ${users.brokerageLinkingBlocked}`, linkLimit: users.brokerageLinkLimit,
      // Qualified by hand: in a single-table select drizzle renders ${users.id} as a bare "id", which here would resolve to the attempt's own id.
      used: sql<number>`(select count(*)::int from production_link_attempts a where a.user_id = "users"."id")`,
    }).from(users)
      .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined)
      .orderBy(desc(users.createdAt)).limit(50),
    productionCapacity(),
    orphanedPool2Items(),
    db.select({
      id: brokerageLinkRequests.id, userId: users.id, email: users.email, name: users.name, note: brokerageLinkRequests.note,
      createdAt: brokerageLinkRequests.createdAt, linkLimit: users.brokerageLinkLimit,
      used: sql<number>`(select count(*)::int from production_link_attempts a where a.user_id = ${users.id})`,
    }).from(brokerageLinkRequests).innerJoin(users, eq(users.id, brokerageLinkRequests.userId))
      .where(eq(brokerageLinkRequests.status, "open")).orderBy(asc(brokerageLinkRequests.createdAt)).limit(100),
  ])
  return NextResponse.json({ users: list.map((u) => ({ ...u, effectiveLimit: effectiveUserLimit(u.linkLimit) })), capacity, orphanedPool2Items: orphanedPool2,
    requests: requests.map(({ linkLimit, ...r }) => ({ ...r, effectiveLimit: effectiveUserLimit(linkLimit) })), credentials: trialCredentialSummary(process.env) })
})

const UpdateAccess = z.object({ userId: z.string().uuid(), allowed: z.boolean().optional(), linkLimit: z.unknown().optional() }).strict()

export const PATCH = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const parsed = UpdateAccess.safeParse(await readJson(request))
  if (!parsed.success || (parsed.data.allowed === undefined && !("linkLimit" in parsed.data))) throw new ApiError("Expected a user ID with an allowed value and/or a link limit", 400)
  const limit = "linkLimit" in parsed.data ? parseLinkLimitOverride(parsed.data.linkLimit) : null
  if (limit && !limit.ok) throw new ApiError("The link limit must be a whole number from 0 to 10, or null to use the default", 400)
  await db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${parsed.data.userId}))`)
    await assertAdmin(userId, store)
    const updated = await store.update(users).set({
      ...(parsed.data.allowed === undefined ? {} : { brokerageLinkingBlocked: !parsed.data.allowed }),
      ...(limit && limit.ok ? { brokerageLinkLimit: limit.value } : {}),
      updatedAt: new Date(),
    })
      .where(eq(users.id, parsed.data.userId)).returning({ id: users.id })
    if (!updated.length) throw new ApiError("User not found", 404)
  })
  return NextResponse.json({ ok: true })
})

const ResolveRequest = z.object({ requestId: z.string().uuid() }).strict()

/** Closes a request. Raising the user's limit is a separate PATCH above. */
export const DELETE = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const parsed = ResolveRequest.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Expected a request ID", 400)
  const closed = await db.update(brokerageLinkRequests).set({ status: "done", resolvedAt: new Date() })
    .where(and(eq(brokerageLinkRequests.id, parsed.data.requestId), eq(brokerageLinkRequests.status, "open"))).returning({ id: brokerageLinkRequests.id })
  if (!closed.length) throw new ApiError("Request not found", 404)
  return NextResponse.json({ ok: true })
})
