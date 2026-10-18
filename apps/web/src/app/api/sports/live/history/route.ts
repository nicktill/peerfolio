import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { ApiError } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { createTtlCache } from "@web/lib/sports/live/cache"
import { dominantSource, downsampleSamples, type Sample } from "@web/lib/sports/live/trend"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cache = createTtlCache<Sample[]>(20_000)

/** Home win probability over the game so far, at most about 90 timed points, for the game chart. View only. */
export const GET = withSportsUser<unknown>(async (_userId, request) => {
  const eventId = new URL(request.url).searchParams.get("eventId") ?? ""
  if (!UUID.test(eventId)) throw new ApiError("Not found", 404)
  const series = await cache.get(eventId, Date.now(), async () => {
    const rows = await db.execute<{ source: string; mid: number; t: number }>(sql`
      SELECT source, mid, extract(epoch from fetched_ts) * 1000 AS t FROM live_quote
      WHERE event_id = ${eventId} AND market = 'moneyline' AND selection = 'home' AND mid IS NOT NULL
        AND fetched_ts > now() - interval '12 hours'
      ORDER BY fetched_ts ASC LIMIT 4000`)
    return downsampleSamples(dominantSource([...rows]).map((r) => ({ t: Number(r.t), v: Number(r.mid) })), 90)
  })
  return NextResponse.json({ series, points: series.map((x) => x.v) }, { headers: { "Cache-Control": "private, max-age=15" } })
})
