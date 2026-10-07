import { NextResponse } from "next/server"
import { desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db, users } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { assertAdmin, productionCapacity } from "@web/lib/plaid-access"

export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120)
  const [list, capacity] = await Promise.all([
    db.select({ id: users.id, email: users.email, name: users.name, allowed: users.brokerageLinkingEnabled }).from(users)
      .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined)
      .orderBy(desc(users.createdAt)).limit(50),
    productionCapacity(),
  ])
  return NextResponse.json({ users: list, capacity })
})

const UpdateAccess = z.object({ userId: z.string().uuid(), allowed: z.boolean() }).strict()

export const PATCH = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const parsed = UpdateAccess.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Expected a user ID and boolean allowed value", 400)
  await db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${parsed.data.userId}))`)
    await assertAdmin(userId, store)
    const updated = await store.update(users).set({ brokerageLinkingEnabled: parsed.data.allowed, updatedAt: new Date() })
      .where(eq(users.id, parsed.data.userId)).returning({ id: users.id })
    if (!updated.length) throw new ApiError("User not found", 404)
  })
  return NextResponse.json({ ok: true })
})
