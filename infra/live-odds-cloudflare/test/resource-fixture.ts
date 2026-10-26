// Local-only fixture entry: no database, credentials, production requests or activation controls.
import { DurableObject } from "cloudflare:workers"
import { createWorkerRunner } from "../../../apps/web/src/lib/sports/live/runner.ts"
import { POLYMARKET_SERIES } from "../../../apps/web/src/lib/sports/live/sources.ts"
import { priceTwoWay } from "../../../apps/web/src/lib/sports/odds.ts"
import type { WorkerDeps } from "../../../apps/web/src/lib/sports/live/worker.ts"
import type { LiveSlate } from "../../../apps/web/src/lib/sports/live/store.ts"
import type { RepriceTarget } from "../../../apps/web/src/lib/sports/reprice.ts"

export class ResourceFixture extends DurableObject {
  async fetch(request: Request) {
    const bytes = Number(new URL(request.url).searchParams.get("mb") ?? 8) * 1024 * 1024
    if (![8, 20].includes(bytes / 1024 / 1024)) return new Response("Unsupported size", { status: 400 })
    let now = Date.parse("2026-10-23T20:00:00Z")
    let quotes = 0, states = 0, repriced = 0, requests = 0, maxRequestBytes = 0
    const sports = Object.keys(POLYMARKET_SERIES)
    const rows = Object.assign(sports.map((sport) => ({ id: sport, externalId: sport, sport, status: "scheduled", startsAt: new Date(now - 3600_000), homeName: "Boston Celtics", awayName: "Detroit Pistons" })), { watched: true }) as LiveSlate
    const targets = sports.map((sport) => ({ marketId: sport, eventId: `${sport}-pre`, sport, homeName: "Boston Celtics", awayName: "Detroit Pistons", startsAt: new Date(now + 3600_000), eventStatus: "scheduled", state: { kind: "moneyline", status: "open", lockAt: new Date(now + 3600_000), createdAt: new Date(now - 3600_000), fairProbA: 0.55, pointA: null, prices: priceTwoWay(0.55)!, repricedAt: null, repriceCount: 0, exchangeOkAt: new Date(now - 60_000), history: [] } })) as RepriceTarget[]
    const deps: WorkerDeps = {
      store: { loadSlate: async () => rows, insertQuotes: async (r) => { quotes += r.length }, upsertState: async () => { states++ } },
      getJson: async (url) => {
        requests++
        if (!url.includes("gamma-api")) return { events: [] }
        const u = new URL(url)
        const pregame = new Date(u.searchParams.get("end_date_min") ?? 0).getTime() >= now
        const item = { slug: "nba-det-bos", live: !pregame, ended: false, score: "50-54", period: "Q2", elapsed: "05:12", startTime: new Date(now + (pregame ? 1 : -1) * 3600_000).toISOString(), markets: [{ sportsMarketType: "moneyline", outcomes: '["Pistons","Celtics"]', clobTokenIds: '["det","bos"]', acceptingOrders: true }], description: "x".repeat(bytes) }
        const json = JSON.stringify([item])
        maxRequestBytes = Math.max(maxRequestBytes, json.length)
        // Exercise response decoding rather than sharing already-parsed fixture objects.
        return new Response(json).json()
      },
      postJson: async (_url, body) => (body as { token_id: string }[]).map(({ token_id }) => ({ asset_id: token_id, timestamp: String(now - 500), bids: [{ price: token_id === "bos" ? "0.57" : "0.41", size: "1000" }], asks: [{ price: token_id === "bos" ? "0.59" : "0.43", size: "1000" }] })),
      reprice: { listTargets: async () => targets, apply: async () => { repriced++; return { applied: true, oldPrices: priceTwoWay(0.55)!, newPrices: priceTwoWay(0.58)!, version: 2 } }, freeze: async () => true, confirm: async () => {} },
    }
    const io = { clock: () => now, watch: { changed: async () => false }, lockDueMarkets: async () => 0, nextStartAfter: async () => null, nextTrackedStartAfter: async () => null, pruneLiveQuotes: async () => 0, writeHeartbeat: async () => {} }
    let runner = createWorkerRunner(deps, io)
    const first = await runner.step()
    const cacheBytes = JSON.stringify([...runner.state.slow]).length
    const checkpoint = runner.checkpoint()
    await this.ctx.storage.put("runner", checkpoint)
    runner = createWorkerRunner(deps, { ...io, checkpoint: await this.ctx.storage.get<string>("runner") })
    const roundtrip = runner.checkpoint() === checkpoint
    now += 31_000
    const second = await runner.step()
    return Response.json({ first, second, sports: sports.length, quotes, states, repriced, requests, maxRequestBytes, cacheBytes, checkpointBytes: checkpoint.length, roundtrip })
  }
}
export default { fetch(request: Request, env: { FIXTURE: DurableObjectNamespace }) { return env.FIXTURE.getByName("resource-check").fetch(request) } }
