import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, withUser } from "@web/lib/api"
import { adminUserDetail } from "@web/lib/admin-users"
import { assertAdmin } from "@web/lib/plaid-access"

type Ctx = { params: Promise<{ id: string }> }

export const GET = withUser<Ctx>(async (userId, _request, { params }) => {
  await assertAdmin(userId)
  const id = z.string().uuid().safeParse((await params).id)
  if (!id.success) throw new ApiError("User not found", 404)
  const detail = await adminUserDetail(id.data)
  if (!detail) throw new ApiError("User not found", 404)
  return NextResponse.json(detail)
})
