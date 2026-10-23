import { budgetReport, evaluateBudget, type BudgetSnapshot, type BudgetReport } from "./infrastructure-budget.ts"

type Env = Record<string, string | undefined>
type Fetcher = typeof fetch
const parse = (value: string | undefined): unknown => { try { return value ? JSON.parse(value) : null } catch { return null } }
const missing = (name: string, message: string) => ({ name, status: "unknown" as const, message })

/** Only calls Neon's control plane, never SQL; credentials and raw provider responses stay server-side. */
export async function readInfrastructureBudget(env: Env, now = Date.now(), request: Fetcher = fetch): Promise<BudgetReport> {
  let neon: unknown = parse(env.INFRA_NEON_SNAPSHOT)
  let neonError: string | undefined
  if (!env.INFRA_NEON_SNAPSHOT && env.NEON_PROJECT_COUNTER_VERIFIED === "true") {
    if (!env.NEON_API_KEY || !env.NEON_PROJECT_ID || !/^[a-z0-9-]{1,60}$/.test(env.NEON_PROJECT_ID)) neonError = "Verified Neon monitoring requires a valid project ID and API key."
    else {
      try {
        const response = await request(`https://console.neon.tech/api/v2/projects/${env.NEON_PROJECT_ID}`, {
          headers: { Authorization: `Bearer ${env.NEON_API_KEY}`, Accept: "application/json" },
          cache: "no-store", signal: AbortSignal.timeout(10_000), redirect: "error",
        })
        if (!response.ok) throw new Error("Provider unavailable")
        const body = await response.json()
        const p = body?.project
        if (p?.id !== env.NEON_PROJECT_ID || typeof p.compute_time_seconds !== "number" || !Number.isFinite(p.compute_time_seconds) || p.compute_time_seconds < 0) throw new Error("Invalid project reading")
        neon = { scope: p.id, unit: "CU-hours", used: p.compute_time_seconds / 3600,
          limit: env.INFRA_NEON_LIMIT_CU_HOURS ? Number(env.INFRA_NEON_LIMIT_CU_HOURS) : 100,
          periodStart: p.consumption_period_start, periodEnd: p.consumption_period_end,
          observedAt: new Date(now).toISOString(), source: "neon-project-estimate" } satisfies BudgetSnapshot
      } catch { neonError = "Neon usage could not be verified. Check credentials, permissions and control-plane availability." }
    }
  }
  const metrics = [neonError ? missing("Neon compute", neonError) : evaluateBudget("Neon compute", neon, env.NEON_PROJECT_ID, "CU-hours", now)]
  metrics.push(evaluateBudget("Vercel active CPU", parse(env.INFRA_VERCEL_CPU_SNAPSHOT), env.INFRA_VERCEL_SCOPE, "CPU-hours", now))
  metrics.push(evaluateBudget("Vercel invocations", parse(env.INFRA_VERCEL_INVOCATIONS_SNAPSHOT), env.INFRA_VERCEL_SCOPE, "invocations", now))
  return budgetReport(metrics, now)
}

let cached: { at: number; report: Promise<BudgetReport> } | undefined
/** Bounded in-process cache; missing/error results expire too. Scheduled CLI reads always bypass it. */
export function cachedInfrastructureBudget(): Promise<BudgetReport> {
  const now = Date.now()
  if (!cached || now - cached.at >= 300_000) cached = { at: now, report: readInfrastructureBudget(process.env, now) }
  return cached.report
}
