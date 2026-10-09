import "server-only"
import { eq } from "drizzle-orm"
import { appSettings, db } from "@web/db"
import { ApiError } from "@web/lib/api"
import { pausedByEnv } from "@web/lib/plaid-switch-core"

const KEY = "plaid_paused"
// Read on every Plaid path, so remember the answer briefly instead of querying each time.
const CACHE_MS = 3_000
let cached: { at: number; paused: boolean } | null = null

/** Whether all Plaid activity is stopped: new links, syncs, webhooks, every paid call. */
export async function plaidPaused(): Promise<boolean> {
  if (pausedByEnv()) return true
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.paused
  let paused = false
  try {
    const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) })
    paused = row?.value === "true"
  } catch (error) {
    // Migrations aren't applied on deploy. Until `app_settings` exists the switch reads as "on",
    // so a missing table can't take syncing down. The env override above still works.
    console.error("[plaid-switch] could not read the switch", error instanceof Error ? error.message : error)
  }
  cached = { at: Date.now(), paused }
  return paused
}

export async function setPlaidPaused(paused: boolean, adminUserId: string): Promise<void> {
  await db
    .insert(appSettings)
    .values({ key: KEY, value: String(paused), updatedBy: adminUserId })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: String(paused), updatedAt: new Date(), updatedBy: adminUserId } })
  cached = { at: Date.now(), paused }
}

export async function plaidPauseInfo() {
  const row = await db.query.appSettings.findFirst({ where: eq(appSettings.key, KEY) }).catch(() => undefined)
  return { paused: await plaidPaused(), byEnv: pausedByEnv(), changedAt: row?.updatedAt ?? null }
}

/** Call before anything that would reach Plaid (and bill). Disconnecting is exempt. */
export async function assertPlaidActive(): Promise<void> {
  if (await plaidPaused()) throw new ApiError("Brokerage connections are paused right now.", 503, { code: "PLAID_PAUSED" })
}
