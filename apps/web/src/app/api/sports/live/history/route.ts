import { NextResponse } from "next/server"
import { sql } from "drizzle-orm"
import { ApiError } from "@web/lib/api"
import { db, withSportsUser } from "@web/lib/sports/api"
import { createTtlCache } from "@web/lib/sports/live/cache"
import { quoteHistory } from "@web/lib/sports/live/history"
import { SOURCE_PRIORITY, type LiveSource } from "@web/lib/sports/live/types"
import type { QuoteRow } from "@web/lib/sports/live/view"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const cache = createTtlCache<ReturnType<typeof quoteHistory>>(20_000)

/** Quality-filtered, normalized probability history from one source. It never changes picks or accepted prices. */
export const GET = withSportsUser<unknown>(async (_userId, request) => {
  const params = new URL(request.url).searchParams
  const eventId = params.get("eventId") ?? ""
  const source = params.get("source") as LiveSource | null
  if (!UUID.test(eventId)) throw new ApiError("Not found", 404)
  if (source !== null && !SOURCE_PRIORITY.includes(source)) throw new ApiError("Unknown quote source", 400)
  const history = await cache.get(`${eventId}:${source ?? 'auto'}`, Date.now(), async () => {
    // Read the newest bounded window, including both outcome books; never truncate the tail of an active game's history.
    const rows = await db.execute<QuoteRow>(sql`
      SELECT market, selection, source, bid, ask, mid, source_ts AS "sourceTs", fetched_ts AS "fetchedTs" FROM live_quote
      WHERE event_id = ${eventId} AND market = 'moneyline'
        AND fetched_ts > now() - interval '12 hours'
        ${source ? sql`AND source = ${source}` : sql``}
      ORDER BY fetched_ts DESC, id DESC LIMIT 12000`)
    return quoteHistory([...rows], source ?? undefined)
  })
  return NextResponse.json({ ...history, points: history.series.map(x => x.v) }, { headers: { "Cache-Control": "private, max-age=15" } })
})
