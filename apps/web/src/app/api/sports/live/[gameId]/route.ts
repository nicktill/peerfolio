import { NextResponse } from "next/server"
import { ApiError } from "@web/lib/api"
import { db, withSportsPublic } from "@web/lib/sports/api"
import { clientIp, createMemoryLimiter, createTtlCache } from "@web/lib/sports/live/cache"
import { PIPELINE } from "@web/lib/sports/live/freshness"
import { emit } from "@web/lib/sports/log"
import { needsOnDemand, onDemandView, type Fetchers } from "@web/lib/sports/live/on-demand"
import { readLiveInput } from "@web/lib/sports/live/store"
import { ageView, buildLiveView, type LiveView } from "@web/lib/sports/live/view"

type Ctx = { params: Promise<{ gameId: string }> }
type View = LiveView | null

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** Unknown game ids are remembered this long, so probing random ids cannot turn into database reads. */
const MISSING_TTL_MS = 60_000
const cache = createTtlCache<View>(PIPELINE.apiCacheMs)
/** Per instance and per IP; a viewer polls about 9 times a minute per live game, so this leaves room for a page of picks. */
const limiter = createMemoryLimiter(120, 60_000)

/**
 * On-demand reads (live/on-demand.ts) for a game the worker is not following yet: at most one per game, and one per upstream URL
 * (a sport's Gamma or Kalshi list is shared by its games), per instance every ON_DEMAND_MS. They only cover the ~30 s until the
 * woken worker stores fresh quotes, after which the stored view is live again and this path is skipped.
 */
const ON_DEMAND_MS = 10_000
const onDemand = createTtlCache<{ view: LiveView | null; at: number }>(ON_DEMAND_MS, 200)
const upstream = createTtlCache<unknown>(ON_DEMAND_MS, 200)
const UA = { "user-agent": "peerfolio-live-odds/0.1", accept: "application/json" }
async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  // Short timeouts: a viewer is waiting, and a miss only means the stored view is served.
  const res = await fetch(url, { ...init, headers: { ...UA, ...(init?.headers ?? {}) }, cache: "no-store", signal: AbortSignal.timeout(url.includes("gamma-api") ? 8_000 : 5_000) })
  if (!res.ok) throw new Error(`${res.status} ${new URL(url).hostname}`)
  return res.json()
}
const fetchers: Fetchers = {
  getJson: (url) => upstream.get(url, Date.now(), () => fetchJson(url)),
  postJson: (url, body) => {
    const json = JSON.stringify(body)
    return upstream.get(`${url} ${json}`, Date.now(), () => fetchJson(url, { method: "POST", headers: { "content-type": "application/json" }, body: json }))
  },
}

/** The stored view, or, while the worker has no live quote for a game that is on (or about to be), a freshly read one. */
async function loadView(gameId: string): Promise<View> {
  const now = new Date()
  const input = await readLiveInput(db, gameId, now)
  if (!input) return null
  const stored = buildLiveView(input, now)
  if (!needsOnDemand(stored)) return stored
  const { value: fresh, hit } = await onDemand.getMeta(gameId, now.getTime(), async () => ({ view: await onDemandView(input, now, fetchers).catch(() => null), at: Date.now() }))
  if (!hit) emit("info", "live.api", { gameId, outcome: fresh.view ? "read_on_demand" : "on_demand_empty", odds: fresh.view?.odds.status ?? null, ms: Date.now() - now.getTime() })
  return fresh.view ? ageView(fresh.view, Math.max(0, Date.now() - fresh.at)) : stored
}

/**
 * Live win probability, score, period and clock for one game, with an as-of time and a freshness label.
 * View only. Reads what the live-odds worker stored. Only while the worker has no live quote for a game on the field (it
 * follows games only while watched, and wakes within about 30 s of a viewer) does it read the exchanges itself, once per game
 * per 10 s per instance (see loadView). It never touches picks or settlement, and live picks never read this view. Cached in-process (PIPELINE.apiCacheMs) and at the CDN; cached
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
  const meta = await cache.getMeta(gameId, started, () => loadView(gameId), (v) => (v ? PIPELINE.apiCacheMs : MISSING_TTL_MS))
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
