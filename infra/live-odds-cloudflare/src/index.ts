import { DurableObject } from "cloudflare:workers"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql as query } from "drizzle-orm"
import {
  newWorkerState,
  runTick,
  type WorkerDeps,
} from "../../../apps/web/src/lib/sports/live/worker.ts"
import { createAdapter, type AdapterEnv } from "./adapter.ts"
import { nextRecovery } from "./recovery.ts"
import { databasePreflight } from "./preflight.ts"
type Env = AdapterEnv & {
  LIVE_ODDS: DurableObjectNamespace<LiveOdds>
  DRY_RUN?: string
  LIVE_ODDS_ENABLED?: string
  LOCAL_DATABASE_URL?: string
}
type Checkpoint = {
  version: 1
  armed: boolean
  nextDue: number
  lastWatchAt: number
  lastMark: string | null
  runner?: string
  lastResult?: unknown
  recovery?: ReturnType<typeof nextRecovery>
  at: number
}
export class LiveOdds extends DurableObject<Env> {
  private saved: Checkpoint = {
    version: 1,
    armed: false,
    nextDue: 0,
    lastWatchAt: 0,
    lastMark: null,
    at: 0,
  }
  private adapter?: ReturnType<typeof createAdapter>
  private serial: Promise<unknown> = Promise.resolve()
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.blockConcurrencyWhile(async () => {
      this.saved =
        (await ctx.storage.get<Checkpoint>("checkpoint")) ?? this.saved
    })
  }
  private enabled() {
    return (
      this.env.DRY_RUN === "0" &&
      this.env.LIVE_ODDS_ENABLED === "1" &&
      !!this.env.DATABASE_URL &&
      !!this.env.CRON_SECRET &&
      this.env.APP_URL === "https://www.peerfolio.org"
    )
  }
  private exclusive<T>(work: () => Promise<T>): Promise<T> {
    const next = this.serial.then(work)
    this.serial = next.catch(() => {})
    return next
  }
  async alarm() {
    return this.exclusive(async () => {
      if (!this.enabled() || !this.saved.armed) {
        await this.ctx.storage.deleteAlarm()
        return
      }
      const now = Date.now()
      try {
        if (now - this.saved.lastWatchAt >= 30000) {
          this.saved.lastWatchAt = now
          try {
            const r = await fetch(`${this.env.APP_URL}/api/sports/watch`, {
              headers: { authorization: `Bearer ${this.env.CRON_SECRET}` },
              signal: AbortSignal.timeout(5000),
            })
            if (r.ok) {
              const b = (await r.json()) as { mark?: unknown }
              if (typeof b.mark === "string") {
                if (
                  this.saved.lastMark !== null &&
                  b.mark !== this.saved.lastMark
                ) {
                  this.adapter ??= createAdapter(this.env, this.saved.runner)
                  this.adapter.runner.wake()
                  this.saved.nextDue = 0
                }
                this.saved.lastMark = b.mark
              }
            }
          } catch (error) {
            console.warn(
              JSON.stringify({
                event: "live.watch_failed",
                error: String(error),
              }),
            )
          }
        }
        if (now >= this.saved.nextDue) {
          this.adapter ??= createAdapter(this.env, this.saved.runner)
          const result = await this.adapter.runner.step()
          await this.adapter.close()
          this.saved.lastResult = result
          this.saved.nextDue = Date.now() + result.delayMs
          this.saved.runner = this.adapter.runner.checkpoint()
          if (result.fatal)
            throw Error(`Worker failed ${result.failures} cycles`)
          this.saved.recovery = undefined
        }
        this.saved.at = Date.now()
        await this.ctx.storage.put("checkpoint", this.saved)
        await this.ctx.storage.setAlarm(
          Math.min(this.saved.nextDue, this.saved.lastWatchAt + 30000),
        )
      } catch (error) {
        await this.adapter?.close().catch(() => {})
        console.error(
          JSON.stringify({ event: "live.alarm_failed", error: String(error) }),
        )
        // Persist a future supervisor attempt rather than relying on six automatic retries.
        // Keep the last good runner checkpoint, including settlement budgets, for recovery.
        this.saved.recovery = nextRecovery(
          this.saved.recovery?.failures ?? 0,
          Date.now(),
          error,
        )
        this.saved.nextDue = this.saved.recovery.nextDue
        this.saved.at = Date.now()
        await this.ctx.storage.put("checkpoint", this.saved)
        await this.ctx.storage.setAlarm(this.saved.nextDue)
      }
    })
  }
  async fetch(request: Request) {
    return this.exclusive(async () => {
      const path = new URL(request.url).pathname
      if (
        path === "/local-cycle-smoke" &&
        this.env.LOCAL_DATABASE_URL &&
        ["127.0.0.1", "localhost"].includes(
          new URL(this.env.LOCAL_DATABASE_URL).hostname,
        )
      ) {
        const adapter = createAdapter({
          ...this.env,
          DATABASE_URL: this.env.LOCAL_DATABASE_URL,
        })
        try {
          const result = await adapter.runner.step()
          await adapter.close()
          const secondCycle = await adapter.runner.step()
          await adapter.close()
          const checkpoint = adapter.runner.checkpoint()
          await this.ctx.storage.put("cycle-smoke", checkpoint)
          const restored = createAdapter(
            { ...this.env, DATABASE_URL: this.env.LOCAL_DATABASE_URL },
            await this.ctx.storage.get<string>("cycle-smoke"),
          )
          const equal = restored.runner.checkpoint() === checkpoint
          await restored.close()
          return Response.json({
            activated: false,
            result,
            checkpointRoundtrip: equal,
            secondCycle,
          })
        } finally {
          await adapter.close()
        }
      }
      if (path === "/local-core-smoke" && this.env.LOCAL_DATABASE_URL) {
        const deps: WorkerDeps = {
          store: {
            loadSlate: async () => [],
            insertQuotes: async () => {
              throw Error("Unexpected write")
            },
            upsertState: async () => {
              throw Error("Unexpected write")
            },
          },
          getJson: async () => {
            throw Error("Unexpected request")
          },
          postJson: async () => {
            throw Error("Unexpected request")
          },
        }
        const result = await runTick(deps, newWorkerState(), new Date())
        await this.ctx.storage.put("smoke", {
          at: Date.now(),
          slate: result.slate,
        })
        return Response.json({
          prototype: true,
          activated: false,
          result,
          durableStorage: await this.ctx.storage.get("smoke"),
        })
      }
      if (
        !this.env.CRON_SECRET ||
        request.headers.get("authorization") !==
          `Bearer ${this.env.CRON_SECRET}`
      )
        return new Response("Unauthorized", { status: 401 })
      if (request.method === "POST" && path === "/preflight") {
        // This operator-only probe must never arm or compete with the current Node owner.
        if (this.env.DRY_RUN !== "1" || this.env.LIVE_ODDS_ENABLED !== "0" || this.saved.armed)
          return new Response("Preflight requires disabled, unarmed worker", { status: 409 })
        try {
          return Response.json(await databasePreflight(this.env.DATABASE_URL), { headers: { "cache-control": "no-store" } })
        } catch {
          // Driver errors may contain connection details; never return or log them.
          return Response.json({ ok: false, error: "Database preflight failed" }, { status: 503, headers: { "cache-control": "no-store" } })
        }
      }
      if (request.method === "POST" && path === "/start") {
        if (!this.enabled())
          return new Response("Disabled: activation gates not satisfied", {
            status: 409,
          })
        this.saved.armed = true
        this.saved.nextDue = 0
        await this.ctx.storage.put("checkpoint", this.saved)
        await this.ctx.storage.setAlarm(Date.now() + 1000)
      } else if (request.method === "POST" && path === "/stop") {
        this.saved.armed = false
        await this.ctx.storage.put("checkpoint", this.saved)
        await this.ctx.storage.deleteAlarm()
      } else if (request.method !== "GET" || path !== "/status")
        return new Response("Not found", { status: 404 })
      return Response.json(
        {
          enabled: this.enabled(),
          armed: this.saved.armed,
          at: this.saved.at,
          nextDue: this.saved.nextDue,
          lastResult: this.saved.lastResult,
          recovery: this.saved.recovery,
        },
        { headers: { "cache-control": "no-store" } },
      )
    })
  }
}
export default {
  async fetch(request: Request, env: Env) {
    if (new URL(request.url).pathname === "/local-db-smoke") {
      const value = env.LOCAL_DATABASE_URL
      if (
        !value ||
        !["127.0.0.1", "localhost", "host.docker.internal"].includes(
          new URL(value).hostname,
        )
      )
        return new Response("Local disposable database only", { status: 403 })
      const client = postgres(value, { max: 1, prepare: false })
      try {
        return Response.json({
          driver: "postgres-js + drizzle",
          rows: await drizzle(client).execute(query`select 1 as driver_ok`),
        })
      } finally {
        await client.end({ timeout: 2 })
      }
    }
    return env.LIVE_ODDS.get(env.LIVE_ODDS.idFromName("production")).fetch(
      request,
    )
  },
}
