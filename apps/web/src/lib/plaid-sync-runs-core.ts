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
