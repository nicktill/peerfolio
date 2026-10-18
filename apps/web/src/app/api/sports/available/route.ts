import { NextResponse } from "next/server"
import { withSportsPublic } from "@web/lib/sports/api"
import { disabledSports } from "@web/lib/sports/enabled"
import { SPORTS } from "@web/lib/sports/types"

/** Which sports are paused right now (SPORTS_DISABLED), so clients can hide them from pickers. Public, not personal. */
export const GET = withSportsPublic(async () => {
  const off = disabledSports()
  return NextResponse.json({ paused: SPORTS.filter((s) => off.has(s)) })
})
