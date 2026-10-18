import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { ApiError } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { createTtlCache } from "@web/lib/sports/live/cache"
import { dominantSource, downsample } from "@web/lib/sports/live/trend"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cache = createTtlCache<number[]>(20_000)

/** Home win probability over the game so far, at most 60 points, for the faded trend lines. View only. */
export const GET = withSportsUser<unknown>(async (_userId, request) => {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? ""
  if (!UUID.test(eventId)) throw new ApiError("Not found", 404)
  const points = await cache.get(eventId, Date.now(), async () => {
    const rows = await db.execute<{ source: string; mid: number }>(sql`
      SELECT source, mid FROM live_quote
      WHERE event_id = ${eventId} AND market = 'moneyline' AND selection = 'home' AND mid IS NOT NULL
        AND fetched_ts > now() - interval '12 hours'
      ORDER BY fetched_ts ASC LIMIT 4000`)
    return downsample(dominantSource([...rows]).map((r) => Number(r.mid)), 60)
  })
  return NextResponse.json({ points }, { headers: { "Cache-Control": "private, max-age=15" } })
})
