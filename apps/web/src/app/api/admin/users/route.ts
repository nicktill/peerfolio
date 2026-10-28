import { NextResponse } from "next/server"
import { withUser } from "@web/lib/api"
import { listAdminUsers } from "@web/lib/admin-users"
import { assertAdmin } from "@web/lib/plaid-access"

export const GET = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 120)
  return NextResponse.json({ users: await listAdminUsers(q || undefined, 100) })
})
