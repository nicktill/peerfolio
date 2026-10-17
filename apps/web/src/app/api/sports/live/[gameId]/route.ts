import { NextResponse } from "next/server"
import { ApiError } from "@web/lib/api"
import { db, withSportsPublic } from "@web/lib/sports/api"
import { clientIp, createMemoryLimiter, createTtlCache } from "@web/lib/sports/live/cache"
import { PIPELINE } from "@web/lib/sports/live/freshness"
import { emit } from "@web/lib/sports/log"
import { readLiveView } from "@web/lib/sports/live/store"
import { ageView } from "@web/lib/sports/live/view"

type Ctx = { params: Promise<{ gameId: string }> }
type View = Awaited<ReturnType<typeof readLiveView>>

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Unknown game ids are remembered this long, so probing random ids cannot turn into database reads. */
const MISSING_TTL_MS = 60_000
const cache = createTtlCache<View>(PIPELINE.apiCacheMs)
/** Per instance and per IP; a viewer polls about 9 times a minute per live game, so this leaves room for a page of picks. */
const limiter = createMemoryLimiter(120, 60_000)

/**
 * Live win probability, score, period and clock for one game, with an as-of time and a freshness label.
 * View only. Reads what the live-odds worker stored; it never calls an upstream feed, so viewers add no upstream
 * load, and it never touches picks or settlement. Cached in-process (PIPELINE.apiCacheMs) and at the CDN; cached
 * time is added to the reported ages so a cached response never looks fresher than it is.
 */
export const GET = withSportsPublic<Ctx>(async (request, { params }) => {
  const { gameId } = await params
  const started = Date.now()
  if (!UUID.test(gameId)) throw new ApiError("Not found", 404)
  const ip = clientIp(request.headers)
  if (!limiter.take(ip, started)) {
    emit("warn", "live.api", { gameId, outcome: "rate_limited", ip })
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": "30" } })
  }
  const meta = await cache.getMeta(gameId, started, () => readLiveView(db, gameId, new Date()), (v) => (v ? PIPELINE.apiCacheMs : MISSING_TTL_MS))
  if (!meta.value) {
    if (!meta.hit) emit("warn", "live.api", { gameId, outcome: "missing_game", cache: "miss" })
    return NextResponse.json({ error: "Not found" }, { status: 404, headers: { "Cache-Control": "public, s-maxage=30" } })
  }
  const view = ageView(meta.value, meta.ageMs)
  const notLive = view.status === "final" || view.status === "unknown"
  // Only the cache-fill (miss) is logged, so a busy game logs about one line per cache lifetime per instance.
  if (!meta.hit) {
    emit(view.odds.status === "paused" && view.status === "live" ? "warn" : "info", "live.api", {
      gameId,
      outcome: view.odds.status === "ok" ? "served_odds" : "served_paused",
      cache: "miss",
      status: view.status,
      odds: view.odds.status === "ok" ? { source: view.odds.source, freshness: view.odds.freshness, ageMs: view.odds.ageMs, confidence: view.odds.confidence } : { reason: view.odds.reason, lastAsOf: view.odds.lastAsOf },
      stateFreshness: view.stateFreshness,
      ms: Date.now() - started,
    })
  }
  return NextResponse.json(view, {
    headers: { "Cache-Control": `public, s-maxage=${notLive ? 30 : Math.round(PIPELINE.cdnMs / 1000)}` },
  })
})
