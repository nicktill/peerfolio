import { NextResponse } from "next/server"
import { z } from "zod"
import { ApiError, readJson } from "@web/lib/api"
import { db, withSportsCron } from "@web/lib/sports/api"
import { voidMarket } from "@web/lib/sports/store"

const Void = z.object({ marketId: z.string().uuid(), reason: z.string().trim().min(2).max(200) })

/**
 * Voids a market (injury or lineup news, bad line) and refunds every open pick.
 * Protected by CRON_SECRET (bearer), not by a user session: curl it from an
 * operator shell. Idempotent: a second call refunds nothing more.
 */
export const POST = withSportsCron<unknown>(async (request) => {
  const parsed = Void.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("marketId and reason are required")
  const result = await voidMarket(db, parsed.data.marketId, parsed.data.reason, new Date())
  return NextResponse.json(result)
})
