import { judgeHealth } from "../../../apps/web/src/lib/sports/live/watchdog.ts"
import { jobsFor, type Job } from "./schedule.ts"

type Env = {
  /** The app's origin, no trailing slash needed. */
  APP_URL: string
  /** Set as a Worker secret (wrangler secret put CRON_SECRET), the same value the app checks. */
  CRON_SECRET: string
  /** "1" logs what would be called and calls nothing. */
  DRY_RUN?: string
  /** "1" includes the sports settle and publish jobs. */
  SPORTS_CRON_ENABLED?: string
  /** "1" runs the live odds watchdog (a health read a minute after each half hour, 15:00-04:59 UTC). */
  LIVE_WATCHDOG_ENABLED?: string
  /** Optional secret: a fine-grained GitHub token with Actions read/write on WATCHDOG_ALERT_REPO. Without it, failures are only logged. */
  WATCHDOG_GITHUB_TOKEN?: string
  /** owner/name of the repository whose "Live odds watchdog" workflow raises the alert. */
  WATCHDOG_ALERT_REPO?: string
}

type Scheduled = { scheduledTime: number }
type Ctx = { waitUntil(promise: Promise<unknown>): void }

// Three news attempts plus two 10s backoffs stay below the Cron 15-minute wall limit.
const TIMEOUT_MS: Record<string, number> = { news: 280_000, warm: 75_000 }

type Dependencies = { fetch: typeof fetch; sleep(ms: number): Promise<void> }
// workerd's native fetch requires the global receiver, not the Dependencies object.
const defaults: Dependencies = { fetch: (...args) => globalThis.fetch(...args), sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }

async function call(env: Env, job: Job, when: Date, deps: Dependencies): Promise<void> {
  const base = env.APP_URL.replace(/\/+$/, "")
  const sep = job.path.includes("?") ? "&" : "?"
  // Warm requests bypass the CDN copy (the page's own cache is what gets filled), like the old workflow did.
  const url = `${base}${job.path}${job.name === "warm" ? `${sep}warm=${when.getTime()}` : ""}`
  const headers: Record<string, string> = job.name === "warm" ? {} : { Authorization: `Bearer ${env.CRON_SECRET}` }
  const attempts = job.name === "warm" ? 1 : 3
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const started = Date.now()
    try {
      // Anything but a 200 is a failure. A redirect would otherwise look like success without the app being reached.
      const res = await deps.fetch(url, { headers, redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS[job.name] ?? 120_000) })
      await res.arrayBuffer()
      const ms = Date.now() - started
      if (res.status === 200) {
        console.log(JSON.stringify({ job: job.name, path: job.path, status: 200, ms, attempt }))
        return
      }
      console.error(JSON.stringify({ job: job.name, path: job.path, status: res.status, ms, attempt }))
    } catch (e) {
      console.error(JSON.stringify({ job: job.name, path: job.path, error: e instanceof Error ? e.message : String(e), attempt }))
    }
    if (attempt < attempts) await deps.sleep(10_000)
  }
  if (job.name !== "warm") throw new Error(`Scheduled job ${job.name} failed after ${attempts} attempts`)
}

/**
 * The live odds watchdog. The health route answers 503 for "down", so this judges the body instead of wanting a 200. Three tries,
 * 20 s apart, so a deploy or a cold start does not alert. On failure it asks GitHub to run the watchdog workflow with the summary:
 * that run fails, and GitHub's failed-run email is the alert (about one Actions minute per alert, nothing while healthy).
 */
async function checkLiveHealth(env: Env, job: Job, deps: Dependencies): Promise<void> {
  const url = `${env.APP_URL.replace(/\/+$/, "")}${job.path}`
  let verdict = { ok: false, summary: "no attempt made" }
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await deps.fetch(url, { headers: { Authorization: `Bearer ${env.CRON_SECRET}` }, redirect: "manual", signal: AbortSignal.timeout(25_000) })
      verdict = judgeHealth(res.status, await res.json().catch(() => null))
    } catch (e) {
      verdict = { ok: false, summary: `health endpoint unreachable: ${e instanceof Error ? e.message : String(e)}` }
    }
    if (verdict.ok) break
    if (attempt < 3) await deps.sleep(20_000)
  }
  if (verdict.ok) {
    console.log(JSON.stringify({ job: job.name, path: job.path, ok: true, summary: verdict.summary }))
    return
  }
  console.error(JSON.stringify({ job: job.name, path: job.path, ok: false, summary: verdict.summary }))
  await raiseAlert(env, verdict.summary, deps)
  throw new Error(`Live odds watchdog: ${verdict.summary}`)
}

async function raiseAlert(env: Env, summary: string, deps: Dependencies): Promise<void> {
  if (!env.WATCHDOG_GITHUB_TOKEN || !env.WATCHDOG_ALERT_REPO) {
    console.error(JSON.stringify({ job: "live-health", alert: "skipped", reason: "WATCHDOG_GITHUB_TOKEN or WATCHDOG_ALERT_REPO is not set" }))
    return
  }
  try {
    const res = await deps.fetch(`https://api.github.com/repos/${env.WATCHDOG_ALERT_REPO}/actions/workflows/live-odds-watchdog.yml/dispatches`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WATCHDOG_GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "User-Agent": "peerfolio-cron", "Content-Type": "application/json" },
      body: JSON.stringify({ ref: "main", inputs: { alert: summary.slice(0, 900) } }),
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    })
    await res.arrayBuffer()
    // GitHub answers 204 for an accepted dispatch.
    console.log(JSON.stringify({ job: "live-health", alert: res.status === 204 ? "sent" : "refused", status: res.status }))
  } catch (e) {
    console.error(JSON.stringify({ job: "live-health", alert: "failed", error: e instanceof Error ? e.message : String(e) }))
  }
}

/** Wait for every job before rejecting so a failed sibling cannot hide another job’s outcome. */
export async function executeJobs(env: Env, jobs: Job[], when: Date, deps: Dependencies = defaults): Promise<void> {
  const results = await Promise.allSettled(jobs.map((job) => (job.name === "live-health" ? checkLiveHealth(env, job, deps) : call(env, job, when, deps))))
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), `${failures.length} scheduled job(s) failed`)
}

export default {
  /** One Cron Trigger (every minute) drives everything: the schedule module decides what is due. */
  async scheduled(controller: Scheduled, env: Env, ctx: Ctx): Promise<void> {
    const when = new Date(controller.scheduledTime)
    const jobs = jobsFor(when, { sports: env.SPORTS_CRON_ENABLED === "1", watchdog: env.LIVE_WATCHDOG_ENABLED === "1" })
    if (!jobs.length) return
    if (env.DRY_RUN === "1") {
      console.log(JSON.stringify({ dryRun: true, at: when.toISOString(), jobs: jobs.map((j) => j.path) }))
      return
    }
    if (!env.CRON_SECRET) {
      throw new Error("CRON_SECRET is not set")
    }
    ctx.waitUntil(executeJobs(env, jobs, when))
  },
}
