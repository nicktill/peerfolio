import "server-only"
import { AsyncLocalStorage } from "node:async_hooks"
import { sql as query } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

declare global {
  var __peerfolioDb: ReturnType<typeof createClient> | undefined
}

function createClient() {
  const url = process.env.DATABASE_URL
  if (!url) {
    throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and point it at your Postgres instance.")
  }
  // `prepare: false` keeps this compatible with transaction-mode connection
  // poolers (Supabase pgBouncer, Neon pooled endpoints).
  const sql = postgres(url, { max: 5, prepare: false })
  return drizzle(sql, { schema })
}

/**
 * Reused across hot reloads in development so we don't exhaust connections,
 * and created lazily so importing this module never throws at build time.
 */
type Database = ReturnType<typeof createClient>
const context = new AsyncLocalStorage<{ database: Database; userId: string; active: boolean }>()

/** All existing db helpers participate in the caller's transaction. Expired
 * contexts (e.g. Next after callbacks) must never reuse a committed transaction. */
export async function withPortfolioWrite<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const current = context.getStore()
  if (current?.active) {
    if (current.userId !== userId) throw new Error("Cross-user portfolio transaction")
    return work()
  }
  // A stable read snapshot prevents repricing halfway through a mutation from
  // masquerading as a contribution. Retry serialization failures only after
  // the entire transaction rolls back (including snapshot and flow events).
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(async tx => {
        await tx.execute(query`select pg_advisory_xact_lock(hashtextextended(${`portfolio:${userId}`}, 0))`)
        const scope = { database: tx as unknown as Database, userId, active: true }
        try { return await context.run(scope, work) } finally { scope.active = false }
      }, { isolationLevel: "serializable" })
    } catch (error) {
      const code = (error as { code?: string; cause?: { code?: string } }).code ?? (error as { cause?: { code?: string } }).cause?.code
      if (attempt >= 2 || (code !== "40001" && code !== "40P01")) throw error
    }
  }
}

export const db: ReturnType<typeof createClient> = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    const scope = context.getStore()
    if (scope?.active) return Reflect.get(scope.database, prop, scope.database)
    if (!globalThis.__peerfolioDb) globalThis.__peerfolioDb = createClient()
    return Reflect.get(globalThis.__peerfolioDb, prop, globalThis.__peerfolioDb)
  },
})

export * from "./schema"
