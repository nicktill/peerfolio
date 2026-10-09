import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { z } from "zod"
import { db, plaidItems } from "@web/db"
import { ApiError, readJson, withUser } from "@web/lib/api"
import { assertAdmin } from "@web/lib/plaid-access"
import { plaidPauseInfo, setPlaidPaused } from "@web/lib/plaid-switch"

/** Owner-only: whether Plaid is paused, and how many live connections exist. */
export const GET = withUser<unknown>(async (userId) => {
  await assertAdmin(userId)
  const [counts] = await db.select({ connections: sql<number>`count(*)::int` }).from(plaidItems)
  return NextResponse.json({ ...(await plaidPauseInfo()), connections: Number(counts?.connections ?? 0) })
})

const Pause = z.object({ paused: z.boolean() }).strict()

/** Pause or resume all Plaid activity. Pausing keeps every connection and its data. */
export const PATCH = withUser<unknown>(async (userId, request) => {
  await assertAdmin(userId)
  const parsed = Pause.safeParse(await readJson(request))
  if (!parsed.success) throw new ApiError("Expected a boolean paused value", 400)
  await setPlaidPaused(parsed.data.paused, userId)
  return NextResponse.json(await plaidPauseInfo())
})
