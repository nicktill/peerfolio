import { NextResponse } from "next/server"
import { desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db, users } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { effectiveUserLimit, parseLinkLimitOverride } from "@web/lib/plaid-access-core"
import { assertAdmin, orphanedPool2Items, productionCapacity } from "@web/lib/plaid-access"
import { trialCredentialSummary } from "@web/lib/plaid-profile"

export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120)
  const [list, capacity, orphanedPool2] = await Promise.all([
    db.select({
      id: users.id, email: users.email, name: users.name, allowed: sql<boolean>`not ${users.brokerageLinkingBlocked}`, linkLimit: users.brokerageLinkLimit,
      used: sql<number>`(select count(*)::int from production_link_attempts a where a.user_id = ${users.id})`,
    }).from(users)
      .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined)
      .orderBy(desc(users.createdAt)).limit(50),
    productionCapacity(),
    orphanedPool2Items(),
  ])
  return NextResponse.json({ users: list.map((u) => ({ ...u, effectiveLimit: effectiveUserLimit(u.linkLimit) })), capacity, orphanedPool2Items: orphanedPool2, credentials: trialCredentialSummary(process.env) })
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
