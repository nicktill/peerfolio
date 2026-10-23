import { DurableObject } from "cloudflare:workers"
import { gammaGamesUrl, parseGammaEvents, POLYMARKET_SERIES } from "../../../apps/web/src/lib/sports/live/sources.ts"

/**
 * One "cycle" of the live odds worker's heaviest step: fetch a Gamma page of games, JSON-parse it and run the app's own
 * parseGammaEvents. Run by a Durable Object alarm every 30s. Read the verdict with `npm run tail`: each alarm prints a JSON
 * event whose `outcome` is "ok" or "exceededCpu"/"exceededMemory", plus `cpuTime` (ms) and `wallTime`.
 */
const SPORTS = ["nba", "cfb", "epl", "nhl"] as const

export class Probe extends DurableObject {
  async fetch(request: Request): Promise<Response> {
    const sport = new URL(request.url).searchParams.get("sport") ?? "nba"
    await this.ctx.storage.put("sport", sport)
    await this.ctx.storage.setAlarm(Date.now() + 1000)
    return new Response(`probe armed for ${sport}; watch with: npm run tail\n`)
  }

  async alarm(): Promise<void> {
    const sport = ((await this.ctx.storage.get<string>("sport")) ?? "nba") as (typeof SPORTS)[number]
    const from = Date.now() - 3 * 3600e3
    const to = Date.now() + 36 * 3600e3
    const res = await fetch(gammaGamesUrl(POLYMARKET_SERIES[sport]!, from, to), { headers: { "user-agent": "peerfolio-live-odds-probe/0.1" } })
    const json = await res.json()
    const games = parseGammaEvents(json as never, new Date())
    console.log(JSON.stringify({ probe: "cycle", sport, status: res.status, bytes: Number(res.headers.get("content-length") ?? 0), games: Array.isArray(games) ? games.length : -1 }))
    await this.ctx.storage.setAlarm(Date.now() + 30_000)
  }
}

export default {
  async fetch(request: Request, env: { PROBE: DurableObjectNamespace }): Promise<Response> {
    return env.PROBE.get(env.PROBE.idFromName("probe")).fetch(request)
  },
}
