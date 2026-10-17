import { NextResponse } from "next/server"
import { ApiError } from "@web/lib/api"
import { db, withSportsPublic } from "@web/lib/sports/api"
import { createTtlCache } from "@web/lib/sports/live/cache"
import { readLiveView } from "@web/lib/sports/live/store"

type Ctx = { params: Promise<{ gameId: string }> }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TTL_MS = 5_000
const cache = createTtlCache<Awaited<ReturnType<typeof readLiveView>>>(TTL_MS)

/**
 * Live win probability, score, period and clock for one game, with an as-of time and a freshness label.
 * View only. Reads what the live-odds worker stored; it never calls an upstream feed, so viewers add no upstream
 * load, and it never touches picks or settlement. Cached 5s in-process and at the CDN.
 */
export const GET = withSportsPublic<Ctx>(async (_request, { params }) => {
  const { gameId } = await params
  if (!UUID.test(gameId)) throw new ApiError("Not found", 404)
  const view = await cache.get(gameId, Date.now(), () => readLiveView(db, gameId, new Date()))
  if (!view) throw new ApiError("Not found", 404)
  return NextResponse.json(view, { headers: { "Cache-Control": "public, s-maxage=5, stale-while-revalidate=5" } })
})
