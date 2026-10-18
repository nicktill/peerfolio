import { NextResponse } from "next/server"
import { desc, eq, ilike, or, sql } from "drizzle-orm"
import { z } from "zod"
import { db, users } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { isAdminEmail } from "@web/lib/plaid-access-core"
import { assertAdmin } from "@web/lib/plaid-access"
import { sportsMode } from "@web/lib/sports/flag"

/** Sports beta access: who can see sports while it is limited to admins and people granted access here. */
export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120)
  const rows = await db.select({ id: users.id, email: users.email, name: users.name, granted: users.sportsAccess })
    .from(users)
    .where(q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined)
    .orderBy(desc(users.sportsAccess), desc(users.createdAt)).limit(50)
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(users).where(eq(users.sportsAccess, true))
  return NextResponse.json({
    mode: sportsMode(),
    granted: count,
    users: rows.map((u) => ({ ...u, admin: isAdminEmail(u.email, process.env.ADMIN_EMAILS) })),
  })
})

const Update = z.object({ userId: z.string().uuid(), allowed: z.boolean() }).strict()

export const PATCH = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const parsed = Update.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Expected a user ID and an allowed value", 400)
  const updated = await db.update(users).set({ sportsAccess: parsed.data.allowed, updatedAt: new Date() }).where(eq(users.id, parsed.data.userId)).returning({ id: users.id })
  if (!updated.length) throw new ApiError("User not found", 404)
  return NextResponse.json({ ok: true })
})
