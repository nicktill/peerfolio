import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "../../../apps/web/src/db/schema.ts"
import { createWorkerRunner } from "../../../apps/web/src/lib/sports/live/runner.ts"
import {
  insertQuotes,
  loadLiveSlate,
  nextStartAfter,
  nextTrackedStartAfter,
  pruneLiveQuotes,
  readSportsActivity,
  upsertState,
  writeHeartbeat,
} from "../../../apps/web/src/lib/sports/live/store.ts"
import {
  applyReprice,
  confirmExchange,
  freezeForReason,
  listRepriceTargets,
  lockDueMarkets,
  reopenWorkerFrozen,
} from "../../../apps/web/src/lib/sports/store.ts"
import type { WorkerDeps } from "../../../apps/web/src/lib/sports/live/worker.ts"
export type AdapterEnv = {
  DATABASE_URL?: string
  APP_URL?: string
  CRON_SECRET?: string
  LIVE_ODDS_BOOK_TS?: string
}
export function createAdapter(env: AdapterEnv, checkpoint?: string) {
  let client: ReturnType<typeof postgres> | null = null
  let connection: ReturnType<typeof drizzle<typeof schema>> | null = null
  const pending = new Set<Promise<unknown>>()
  const db = () => {
    if (!connection) {
      if (!env.DATABASE_URL) throw Error("DATABASE_URL missing")
      client = postgres(env.DATABASE_URL, {
        max: 2,
        prepare: false,
        connect_timeout: 10,
      })
      connection = drizzle(client, { schema })
    }
    return connection
  }
  const request = async (url: string, init?: RequestInit) => {
    const r = await fetch(url, {
      ...init,
      headers: {
        "user-agent": "peerfolio-live-odds/0.1",
        accept: "application/json",
        ...init?.headers,
      },
      signal: AbortSignal.timeout(url.includes("gamma-api") ? 25000 : 8000),
    })
    if (!r.ok) throw Error(`Upstream ${r.status} ${new URL(url).hostname}`)
    return r.json()
  }
  const deps: WorkerDeps = {
    store: {
      loadSlate: (n) => loadLiveSlate(db(), n),
      insertQuotes: (r) => insertQuotes(db(), r),
      upsertState: (id, s) => upsertState(db(), id, s),
    },
    getJson: (u) => request(u),
    postJson: (u, b) =>
      request(u, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
      }),
    reprice: {
      listTargets: (n) => listRepriceTargets(db(), n),
      apply: (id, b, d, n) => applyReprice(db(), id, b, d, n),
      freeze: (id, r) => freezeForReason(db(), id, r),
      reopen: (id, n) => reopenWorkerFrozen(db(), id, n),
      confirm: (ids, n) => confirmExchange(db(), ids, n),
      lastActivity: () => readSportsActivity(db()),
    },
    bookMode: env.LIVE_ODDS_BOOK_TS === "fetch" ? "fetch" : "strict",
    emit: (level, event, fields) =>
      console.log(
        JSON.stringify({ level, event, host: "cloudflare", ...fields }),
      ),
    triggerSettle: (id, kind) => {
      const task = (async () => {
        const r = await fetch(
          `${env.APP_URL}/api/cron/sports/settle?eventId=${encodeURIComponent(id)}&kind=${kind}`,
          {
            headers: { authorization: `Bearer ${env.CRON_SECRET}` },
            signal: AbortSignal.timeout(90000),
          },
        )
        if (!r.ok) throw Error(`Settle trigger ${r.status}`)
        const b = (await r.json()) as {
          outcome?: {
            ran?: boolean
            settled?: number
            voided?: number
            review?: number
            reason?: string
          }
        }
        const o = b.outcome
        return {
          done:
            !!o &&
            ((o.ran === true &&
              (o.settled ?? 0) + (o.voided ?? 0) + (o.review ?? 0) > 0) ||
              o.reason === "no_open_markets" ||
              o.reason === "budget_spent"),
        }
      })()
      pending.add(task)
      void task.finally(() => pending.delete(task)).catch(() => {})
      return task
    },
  }
  const runner = createWorkerRunner(deps, {
    checkpoint,
    watch: { changed: async () => false },
    lockDueMarkets: (n) => lockDueMarkets(db(), n),
    nextStartAfter: (n) => nextStartAfter(db(), n),
    nextTrackedStartAfter: (n) => nextTrackedStartAfter(db(), n),
    pruneLiveQuotes: (n) => pruneLiveQuotes(db(), n),
    writeHeartbeat: (i) => writeHeartbeat(db(), i),
  })
  return {
    runner,
    async close() {
      await Promise.allSettled([...pending])
      if (client) await client.end({ timeout: 2 })
      client = null
      connection = null
    },
  }
}
