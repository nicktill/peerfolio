/** Pure evaluator shared by admin UI and CI; no database connections. */
export type BudgetSnapshot = {
  scope: string; unit: "CU-hours" | "CPU-hours" | "invocations"
  used: number; limit: number; periodStart: string; periodEnd: string; observedAt: string
  source: "console" | "neon-project-estimate"
}
export type BudgetResult = {
  name: string; status: "healthy" | "watch" | "warning" | "critical" | "unknown"
  message: string; snapshot?: BudgetSnapshot; percent?: number; forecast?: number; runwayDays?: number | null
}
export type BudgetReport = { checkedAt: string; failed: boolean; metrics: BudgetResult[] }
const DAY = 86_400_000
export function evaluateBudget(name: string, raw: unknown, scope: string | undefined, unit: BudgetSnapshot["unit"], now = Date.now()): BudgetResult {
  const unknown = (message: string): BudgetResult => ({ name, status: "unknown", message })
  if (!scope?.trim()) return unknown("Monitoring scope is not configured.")
  if (!raw || typeof raw !== "object") return unknown("No verified usage reading configured.")
  const s = raw as BudgetSnapshot
  const start = Date.parse(s.periodStart), end = Date.parse(s.periodEnd), observed = Date.parse(s.observedAt)
  if (s.scope !== scope || s.unit !== unit) return unknown("Usage scope or units do not match the configured budget.")
  if (![s.used, s.limit].every(Number.isFinite) || s.used < 0 || s.limit <= 0) return unknown("Usage or limit is invalid.")
  if (![start, end, observed].every(Number.isFinite) || start > now || end <= now || end <= start || end - start > 35 * DAY || start < now - 35 * DAY) return unknown("Usage reading is not for the current monthly period.")
  if (observed < start || observed > now + 300_000 || now - observed > 36 * 3_600_000) return unknown("Usage reading is stale or has an invalid observation time; refresh within 36 hours.")
  if (s.source !== "console" && s.source !== "neon-project-estimate") return unknown("Usage source is not recognized.")
  if (s.source === "neon-project-estimate" && unit !== "CU-hours") return unknown("Estimated Neon readings require CU-hours.")
  const percent = s.used / s.limit * 100
  // Forecast at the observation time: stale readings must never make burn rate look lower.
  const elapsed = observed - start
  const rate = elapsed >= DAY ? s.used / (elapsed / DAY) : null
  const forecast = rate == null ? undefined : rate * ((end - start) / DAY)
  const runwayDays = rate == null || rate === 0 ? null : Math.max(0, (s.limit - s.used) / rate)
  const status = percent >= 90 ? "critical" : percent >= 75 || (forecast != null && forecast >= s.limit) ? "warning" : percent >= 60 ? "watch" : "healthy"
  const message = percent >= 90 ? "Budget nearly exhausted." : percent >= 75 ? "Budget warning threshold reached." : forecast != null && forecast >= s.limit ? "Current pace is projected to exceed the period budget." : percent >= 60 ? "Watch usage as the period progresses." : "Within the configured budget."
  return { name, status, message, snapshot: s, percent, forecast, runwayDays }
}
export function budgetReport(metrics: BudgetResult[], now = Date.now()): BudgetReport {
  return { checkedAt: new Date(now).toISOString(), failed: metrics.some(m => m.status === "unknown" || m.status === "warning" || m.status === "critical"), metrics }
}
