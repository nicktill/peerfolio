/**
 * Judges a response from /api/sports/live/health for the scheduled watchdog (.github/workflows/live-odds-watchdog.yml).
 * Pure so it is tested without a network. The health route answers 503 only for "down"; a worker that has stopped while no game is
 * live reports "degraded" with a "worker silent" or "worker has never reported" reason, which is the outage we most need to hear about.
 */
export type WatchdogVerdict = { ok: boolean; summary: string }

export function judgeHealth(httpStatus: number, body: unknown): WatchdogVerdict {
  if (httpStatus === 401 || httpStatus === 403) return { ok: false, summary: `health endpoint refused the secret (HTTP ${httpStatus}); check CRON_SECRET` }
  const b = body && typeof body === "object" ? (body as { status?: unknown; reasons?: unknown }) : null
  if (!b || typeof b.status !== "string") return { ok: false, summary: `health endpoint gave no usable answer (HTTP ${httpStatus})` }
  const reasons = Array.isArray(b.reasons) ? b.reasons.filter((r): r is string => typeof r === "string") : []
  const detail = reasons.length ? ` Reasons: ${reasons.join("; ")}` : ""
  if (b.status === "down" || httpStatus >= 500) return { ok: false, summary: `live odds are DOWN.${detail}` }
  const silent = reasons.find((r) => /worker silent|never reported|failed \d+ cycles/i.test(r))
  if (silent) return { ok: false, summary: `live odds worker problem: ${silent}.${detail}` }
  return { ok: true, summary: `live odds ${b.status}.${detail}` }
}
