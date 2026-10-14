import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { restoreManualAccount } from "@web/lib/account-replacement"

export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = z.object({ manualAccountId: z.string().uuid() }).safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Choose an archived account")
  return NextResponse.json(await restoreManualAccount(userId, parsed.data.manualAccountId))
})
