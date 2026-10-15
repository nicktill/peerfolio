/** Plain-English reading of sync runs for the admin page. Pure: takes the counts and codes the log already stores. */

export type ExplainRun = {
  trigger: string
  startedAt: string | Date
  durationMs: number
  status: "ok" | "partial" | "failed"
  errorCode: string | null
  accounts: number
  received: number
  kept: number
  skipped: Record<string, number>
  currencyAssumed: number
  missingTicker: number
  balanceWithoutHoldings: boolean
}

export type Severity = "ok" | "info" | "warn" | "error"
export type Explanation = { severity: Severity; headline: string; detail: string; action: string | null }

export const SLOW_RUN_MS = 10_000

export const TRIGGER_LABELS: Record<string, { label: string; hint: string }> = {
  cron: { label: "Scheduled", hint: "Background refresh that runs on a schedule" },
  webhook: { label: "Plaid webhook", hint: "Plaid told us new data was ready" },
  manual: { label: "Manual", hint: "Someone pressed refresh or Sync now" },
  link: { label: "Just linked", hint: "First sync right after connecting the account" },
  "admin-refresh": { label: "Re-extract", hint: "Admin asked Plaid to re-pull from the institution" },
}
export const triggerLabel = (trigger: string) => TRIGGER_LABELS[trigger]?.label ?? trigger

const ERROR_EXPLANATIONS: Record<string, { detail: string; action: string }> = {
  ITEM_LOGIN_REQUIRED: { detail: "The user's login at the institution expired or changed, so Plaid can no longer read the account.", action: "The user has to reconnect the account (Reconnect in their Accounts card)." },
  PENDING_EXPIRATION: { detail: "The institution connection is about to expire.", action: "Ask the user to reconnect soon." },
  ADDITIONAL_CONSENT_REQUIRED: { detail: "The institution needs the user to grant access to investments.", action: "The user has to reconnect and approve the investments permission." },
  PRODUCT_NOT_READY: { detail: "Plaid hasn't finished pulling investment data yet. This is normal right after linking.", action: "Wait a few minutes. A webhook will sync it automatically." },
  INSTITUTION_DOWN: { detail: "The institution's site is down or in maintenance.", action: "Nothing to do. It will work again when the institution recovers." },
  INSTITUTION_NOT_RESPONDING: { detail: "The institution didn't answer in time.", action: "Usually clears on its own. Retry later with Sync now." },
  INSTITUTION_NOT_AVAILABLE: { detail: "The institution is temporarily unavailable through Plaid.", action: "Retry later." },
  RATE_LIMIT_EXCEEDED: { detail: "Plaid is throttling requests for this connection.", action: "Wait about 10 minutes before trying again." },
  INVESTMENTS_NOT_SUPPORTED: { detail: "Plaid can't read investments from this institution or account type.", action: "Holdings will have to be imported by hand for this account." },
  PRODUCTS_NOT_SUPPORTED: { detail: "This institution doesn't offer investments data through Plaid.", action: "Holdings will have to be imported by hand for this account." },
  NO_INVESTMENT_ACCOUNTS: { detail: "The connection has no investment accounts.", action: "Check whether the user linked the right accounts." },
  INTERNAL_SERVER_ERROR: { detail: "Plaid had an internal error.", action: "Retry later. If it persists, send the request ID to Plaid support." },
  REFRESH_FAILED: { detail: "Plaid couldn't re-extract data from the institution (the request errored or timed out).", action: "Wait 10 minutes and try again, or use plain Sync now to re-read what Plaid already has." },
  SYNC_FAILED: { detail: "The sync stopped on an error we didn't classify.", action: "Check the server logs around this time and the request ID, if there is one." },
}

const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`
const skippedTotal = (skipped: Record<string, number>) => Object.values(skipped).reduce((a, b) => a + b, 0)

export function explainRun(run: ExplainRun): Explanation {
  const slow = run.durationMs >= SLOW_RUN_MS
  const slowNote = slow ? ` The institution was slow to answer (${secs(run.durationMs)}).` : ""

  if (run.status === "failed") {
    const known = run.errorCode ? ERROR_EXPLANATIONS[run.errorCode] : undefined
    return {
      severity: "error",
      headline: run.trigger === "admin-refresh" ? "Re-extract failed" : "Sync failed",
      detail: `${known?.detail ?? `Plaid or the institution returned ${run.errorCode ?? "an error"}.`}${slowNote} Nothing was saved from this attempt.`,
      action: known?.action ?? "Check the request ID with Plaid, or retry with Sync now.",
    }
  }

  if (run.balanceWithoutHoldings) {
    return {
      severity: "warn",
      headline: "Balances saved, holdings missing",
      detail: `Plaid returned ${plural(run.accounts, "account")} but ${run.received === 0 ? "no positions" : "no usable positions"}.${slowNote} The balance is shown on the dashboard, but its positions can't be.`,
      action: "Either the account really holds only cash, or Plaid's investment data wasn't ready. Sync now once; if it repeats on every run, the institution isn't returning positions for it.",
    }
  }

  if (run.received > 0 && run.kept === 0) {
    return { severity: "warn", headline: "Every holding was left out", detail: `Plaid sent ${plural(run.received, "line")} but none could be kept (${Object.entries(run.skipped).map(([r, n]) => `${n} ${r}`).join(", ") || "no reason recorded"}).`, action: "Look at the left-out reasons. This is usually unsupported currency or securities." }
  }

  const left = skippedTotal(run.skipped)
  if (left > 0) {
    return { severity: "info", headline: "Synced, some lines left out", detail: `Kept ${run.kept} of ${run.received} lines. Left out: ${Object.entries(run.skipped).map(([r, n]) => `${n} ${r}`).join(", ")}.${slowNote}`, action: null }
  }
  if (run.currencyAssumed > 0) {
    return { severity: "info", headline: "Synced, currency assumed", detail: `${plural(run.currencyAssumed, "line")} came without a currency, so the account's currency was used.`, action: null }
  }
  if (run.missingTicker > 0) {
    return { severity: "info", headline: "Synced, some securities have no ticker", detail: `${plural(run.missingTicker, "security")} had no ticker symbol from Plaid. They can't be priced.`, action: null }
  }
  return { severity: "ok", headline: "Synced cleanly", detail: `${plural(run.kept, "holding")} across ${plural(run.accounts, "account")}.${slowNote}`, action: null }
}

export type ItemHealth = {
  severity: Severity
  headline: string
  detail: string
  action: string | null
  /** Newest first, capped. */
  recent: Severity[]
  lastCleanAt: string | null
  badStreak: number
}

const rank: Record<Severity, number> = { ok: 0, info: 0, warn: 1, error: 2 }

/** One connection's health from its runs, newest first. */
export function itemHealth(runs: ExplainRun[]): ItemHealth {
  if (!runs.length) return { severity: "info", headline: "No syncs recorded", detail: "Nothing in the last 30 days of logs for this connection.", action: null, recent: [], lastCleanAt: null, badStreak: 0 }

  const explained = runs.map((r) => ({ run: r, ex: explainRun(r) }))
  const bad = (s: Severity) => rank[s] > 0
  let badStreak = 0
  while (badStreak < explained.length && bad(explained[badStreak].ex.severity)) badStreak++
  const clean = explained.find((e) => !bad(e.ex.severity))
  const lastCleanAt = clean ? new Date(clean.run.startedAt).toISOString() : null
  const latest = explained[0]
  const recent = explained.slice(0, 12).map((e) => e.ex.severity)

  if (badStreak === 0) {
    const failedBefore = explained.slice(1, 6).filter((e) => e.ex.severity === "error").length
    return {
      severity: latest.ex.severity === "info" ? "info" : "ok",
      headline: latest.ex.headline,
      detail: failedBefore ? `${latest.ex.detail} Recovered after ${plural(failedBefore, "earlier failure")}.` : latest.ex.detail,
      action: latest.ex.action,
      recent, lastCleanAt, badStreak,
    }
  }

  const worst = explained.slice(0, badStreak).reduce((w, e) => (rank[e.ex.severity] > rank[w] ? e.ex.severity : w), "warn" as Severity)
  const repeating = badStreak >= 2
  const since = lastCleanAt ? `Last clean sync was ${new Date(lastCleanAt).toLocaleString()}.` : `No clean sync in the ${plural(runs.length, "run")} on record.`
  return {
    severity: worst,
    headline: repeating ? `${latest.ex.headline} (${badStreak} runs in a row)` : latest.ex.headline,
    detail: `${latest.ex.detail}${repeating ? ` ${since}` : ""}`,
    action: latest.ex.action,
    recent, lastCleanAt, badStreak,
  }
}
