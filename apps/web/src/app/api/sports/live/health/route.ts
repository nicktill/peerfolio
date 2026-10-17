import { NextResponse } from "next/server"
import { db, withSportsCron } from "@web/lib/sports/api"
import { liveHealth, WORKER_NAME } from "@web/lib/sports/live/health"
import { emit } from "@web/lib/sports/log"
import { readHealthInput } from "@web/lib/sports/live/store"

export const dynamic = "force-dynamic"

/**
 * Live odds pipeline health without reading logs: newest quote age per live game, the worker's last cycle,
 * unmatched games with reasons, and an overall ok / degraded / down (503 only for down). Same auth as the sports
 * crons: `Authorization: Bearer $CRON_SECRET`, so a monitor or an operator's curl can call it. Not cached.
 *
 *   curl -s -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/sports/live/health
 */
export const GET = withSportsCron<unknown>(async () => {
  const now = new Date()
  const health = liveHealth(await readHealthInput(db, WORKER_NAME, now), now)
  emit(health.status === "ok" ? "info" : health.status === "degraded" ? "warn" : "error", "live.health", { status: health.status, reasons: health.reasons, games: health.games.length, unmatched: health.unmatched.length })
  return NextResponse.json({ at: now.toISOString(), ...health }, { status: health.httpStatus, headers: { "Cache-Control": "no-store" } })
})
