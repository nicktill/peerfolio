import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { db } from "@web/db"
import { withUser } from "@web/lib/api"
import { assistantConfigured } from "@web/lib/ai/limits"

/**
 * Whether to show the assistant to the signed-in user: it is configured (key, budget, not switched off) and
 * its table exists. If a deploy's migration didn't apply, the launcher stays hidden instead of failing on use.
 */
export const GET = withUser<unknown>(async () => {
  if (!assistantConfigured(process.env)) return NextResponse.json({ available: false })
  try {
    await db.execute(sql`select 1 from ai_usage limit 1`)
    return NextResponse.json({ available: true })
  } catch {
    return NextResponse.json({ available: false })
  }
})
