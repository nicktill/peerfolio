import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { sql } from "drizzle-orm"
import * as schema from "../../../apps/web/src/db/schema.ts"

/** Explicit operator probe; validates TLS and column access without running a worker cycle or reading member rows. */
export async function databasePreflight(value: string | undefined) {
  if (!value || !new URL(value).hostname.endsWith(".neon.tech")) throw Error("Neon connection required")
  const client = postgres(value, { ssl: "verify-full", max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} })
  try {
    const tables = [schema.sportsEvents, schema.sportsLeagues, schema.sportsMembers, schema.sportsPicks, schema.sportsMarkets, schema.sportsLines, schema.sportsLineHistory, schema.liveQuote, schema.liveState, schema.liveWorker]
    await drizzle(client).transaction(async (tx) => {
      await tx.execute(sql`set local statement_timeout = '10s'`)
      for (const table of tables) await tx.select().from(table).limit(0)
    }, { accessMode: "read only" })
    return { ok: true, tls: "verified", readOnly: true, schemaTables: tables.length }
  } finally {
    await client.end({ timeout: 2 })
  }
}
