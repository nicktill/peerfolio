import { judgeHealth } from "../src/lib/sports/live/watchdog.ts"

// Called by the scheduled watchdog. Needs APP_URL and CRON_SECRET; a missing value fails the run on purpose.
const base = process.env.APP_URL?.replace(/\/$/, "")
const secret = process.env.CRON_SECRET
if (!base || !secret) {
  console.error("APP_URL and CRON_SECRET must be set for the live odds watchdog.")
  process.exit(1)
}

let verdict = { ok: false, summary: "no attempt made" }
// Three tries, 20 s apart: a deploy or a cold start should not page anyone.
for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await fetch(`${base}/api/sports/live/health`, { headers: { authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(25_000), redirect: "error" })
    const body = await res.json().catch(() => null)
    verdict = judgeHealth(res.status, body)
  } catch (error) {
    verdict = { ok: false, summary: `health endpoint unreachable: ${error instanceof Error ? error.message : "unknown error"}` }
  }
  if (verdict.ok) break
  if (attempt < 3) await new Promise((r) => setTimeout(r, 20_000))
}
console.log(verdict.summary)
if (!verdict.ok) {
  console.error("Live odds watchdog failed. Check Admin > Sports health and the Live odds worker workflow.")
  process.exitCode = 1
}
