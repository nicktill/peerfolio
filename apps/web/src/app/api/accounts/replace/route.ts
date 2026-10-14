import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { replaceManualAccount } from "@web/lib/account-replacement"

const Replacement = z.object({ manualAccountId: z.string().uuid(), linkedAccountId: z.string().uuid(), confirmed: z.literal(true), acknowledgeNoHoldings: z.boolean().optional() })
export const POST = withUser<unknown>(async (userId, request) => {
  const parsed = Replacement.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Select both accounts and confirm they represent the same investment account")
  return NextResponse.json(await replaceManualAccount(userId, parsed.data.manualAccountId, parsed.data.linkedAccountId, { acknowledgeNoHoldings: parsed.data.acknowledgeNoHoldings }))
})
