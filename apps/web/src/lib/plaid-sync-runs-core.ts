/** Pure parts of the persistent sync log, so recording and highlighting can be tested without a database. */
export const SYNC_RUN_RETENTION_DAYS = 30

export type SyncTrigger = "cron" | "webhook" | "manual" | "link"
export type SyncRunStatus = "ok" | "partial" | "failed"

export type SyncRunMetrics = {
  accounts: number
  holdingsReceived: number
  holdingsKept: number
  skipped: Record<string, number>
  currencyAssumed: number
  securitiesMissingTicker: number
  balanceWithoutHoldings: boolean
  requestId: string | null
}

export const emptyMetrics = (): SyncRunMetrics => ({
  accounts: 0, holdingsReceived: 0, holdingsKept: 0, skipped: {}, currencyAssumed: 0, securitiesMissingTicker: 0, balanceWithoutHoldings: false, requestId: null,
})

/** Securities Plaid sent without a ticker symbol. */
export const countMissingTicker = (list: { ticker_symbol?: string | null }[]) => list.filter((s) => !s.ticker_symbol?.trim()).length

/** Failed beats partial beats ok. Partial means the sync saved, but positions are missing or still loading. */
export function runStatus(failed: boolean, metrics: Pick<SyncRunMetrics, "balanceWithoutHoldings">): SyncRunStatus {
  return failed ? "failed" : metrics.balanceWithoutHoldings ? "partial" : "ok"
}

/** Row for plaid_sync_runs. Only counts, codes and ids: nothing about balances, tickers or holding contents. */
export function buildSyncRun(input: { itemId: string; userId: string; trigger: SyncTrigger; startedAt: Date; finishedAt: Date; failed: boolean; errorCode?: string | null; metrics: SyncRunMetrics }) {
  const { metrics } = input
  return {
    itemId: input.itemId,
    userId: input.userId,
    trigger: input.trigger,
    startedAt: input.startedAt,
    durationMs: Math.max(0, input.finishedAt.getTime() - input.startedAt.getTime()),
    status: runStatus(input.failed, metrics),
    errorCode: input.failed ? (input.errorCode ?? "SYNC_FAILED").slice(0, 80) : null,
    requestId: metrics.requestId?.slice(0, 80) ?? null,
    accountsReceived: metrics.accounts,
    holdingsReceived: metrics.holdingsReceived,
    holdingsKept: metrics.holdingsKept,
    holdingsSkipped: metrics.skipped,
    currencyAssumed: metrics.currencyAssumed,
    securitiesMissingTicker: metrics.securitiesMissingTicker,
    balanceWithoutHoldings: metrics.balanceWithoutHoldings,
  }
}

export type SyncRunRow = ReturnType<typeof buildSyncRun>

/** Why a run deserves a second look, or null. Used to highlight rows on the admin page. */
export function runConcern(run: Pick<SyncRunRow, "balanceWithoutHoldings" | "holdingsReceived" | "holdingsKept" | "currencyAssumed"> & { status: string; holdingsSkipped: Record<string, number> }): string | null {
  if (run.status === "failed") return "Sync failed"
  if (run.balanceWithoutHoldings) return "Balance but no holdings"
  const skipped = Object.values(run.holdingsSkipped).reduce((a, b) => a + b, 0)
  if (run.holdingsReceived > 0 && run.holdingsKept === 0) return "Every holding line was left out"
  if (skipped > 0) return "Some lines left out"
  if (run.currencyAssumed > 0) return "Line currency missing, account currency assumed"
  return null
}

/** The request id Plaid attaches to its responses and errors, when there is one. */
export function plaidRequestId(source: unknown): string | null {
  const s = source as { data?: { request_id?: unknown }; response?: { data?: { request_id?: unknown } } } | null
  const id = s?.data?.request_id ?? s?.response?.data?.request_id
  return typeof id === "string" ? id : null
}

/** One on-demand run per connection per minute, so the page can't hammer Plaid. */
export const MANUAL_RUN_COOLDOWN_MS = 60_000

export type ManualRunGate = { ok: true } | { ok: false; reason: "in_flight" | "cooldown"; retryAfterSec: number }

/** Decides whether an admin-triggered run may start. `lastFinishedAt` is when the connection's latest run of any kind ended. */
export function manualRunGate(input: { lastFinishedAt: Date | null; now: Date; inFlight: boolean }): ManualRunGate {
  if (input.inFlight) return { ok: false, reason: "in_flight", retryAfterSec: Math.ceil(MANUAL_RUN_COOLDOWN_MS / 1000) }
  if (!input.lastFinishedAt) return { ok: true }
  const waitMs = input.lastFinishedAt.getTime() + MANUAL_RUN_COOLDOWN_MS - input.now.getTime()
  return waitMs > 0 ? { ok: false, reason: "cooldown", retryAfterSec: Math.ceil(waitMs / 1000) } : { ok: true }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const isItemRowId = (value: unknown): value is string => typeof value === "string" && UUID.test(value)

type RunLike = Omit<SyncRunRow, "itemId" | "userId" | "trigger" | "status" | "holdingsSkipped"> & { trigger: string; status: string; holdingsSkipped: unknown }

/** What the admin API and page show for one run: counts and codes, never ids of other tables, tokens or balances. */
export function summarizeRun(run: RunLike) {
  const skipped = run.holdingsSkipped as Record<string, number>
  return {
    trigger: run.trigger,
    startedAt: run.startedAt,
    durationMs: run.durationMs,
    status: run.status,
    errorCode: run.errorCode,
    requestId: run.requestId,
    accounts: run.accountsReceived,
    received: run.holdingsReceived,
    kept: run.holdingsKept,
    skipped,
    awaiting: run.balanceWithoutHoldings,
    concern: runConcern({ ...run, holdingsSkipped: skipped }),
  }
}
