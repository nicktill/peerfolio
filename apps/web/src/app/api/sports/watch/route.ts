import { NextResponse } from "next/server"
import { withSportsCron } from "@web/lib/sports/api"
import { watchMark } from "@web/lib/sports/live/watch"

export const dynamic = "force-dynamic"

/** For the live odds worker (CRON_SECRET): a mark that changes when someone opens sports. Answered from the data cache, no database. */
export const GET = withSportsCron<unknown>(async () => NextResponse.json({ mark: await watchMark() }, { headers: { "Cache-Control": "no-store" } }))
