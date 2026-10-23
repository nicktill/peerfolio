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
}

type Scheduled = { scheduledTime: number }
type Ctx = { waitUntil(promise: Promise<unknown>): void }

// Three news attempts plus two 10s backoffs stay below the Cron 15-minute wall limit.
const TIMEOUT_MS: Record<string, number> = { news: 280_000, warm: 75_000 }

type Dependencies = { fetch: typeof fetch; sleep(ms: number): Promise<void> }
const defaults: Dependencies = { fetch: globalThis.fetch, sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }

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

/** Wait for every job before rejecting so a failed sibling cannot hide another job’s outcome. */
export async function executeJobs(env: Env, jobs: Job[], when: Date, deps: Dependencies = defaults): Promise<void> {
  const results = await Promise.allSettled(jobs.map((job) => call(env, job, when, deps)))
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected")
  if (failures.length) throw new AggregateError(failures.map((failure) => failure.reason), `${failures.length} scheduled job(s) failed`)
}

export default {
  /** One Cron Trigger (every minute) drives everything: the schedule module decides what is due. */
  async scheduled(controller: Scheduled, env: Env, ctx: Ctx): Promise<void> {
    const when = new Date(controller.scheduledTime)
    const jobs = jobsFor(when, { sports: env.SPORTS_CRON_ENABLED === "1" })
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
