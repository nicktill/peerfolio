import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "./schema"

declare global {
  // eslint-disable-next-line no-var
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
export const db: ReturnType<typeof createClient> = new Proxy({} as ReturnType<typeof createClient>, {
  get(_target, prop) {
    if (!globalThis.__peerfolioDb) globalThis.__peerfolioDb = createClient()
    return Reflect.get(globalThis.__peerfolioDb, prop, globalThis.__peerfolioDb)
  },
})

export * from "./schema"
