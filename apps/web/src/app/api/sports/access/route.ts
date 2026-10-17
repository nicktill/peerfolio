import { NextResponse } from "next/server"
import { getCurrentUserId } from "@web/lib/auth"
import { sportsAccessFor } from "@web/lib/sports/access"

export const dynamic = "force-dynamic"

/** Whether the UI should show sports to this visitor. Always 200 (never 404) so the client can ask; signed out is simply false. */
export async function GET() {
  let enabled = false
  try {
    enabled = await sportsAccessFor(await getCurrentUserId())
  } catch {
    enabled = false
  }
  return NextResponse.json({ enabled }, { headers: { "Cache-Control": "private, no-store" } })
}
