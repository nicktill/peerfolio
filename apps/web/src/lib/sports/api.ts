import "server-only"
import { NextResponse } from "next/server"
import { ApiError, assertCronAuthorized, withPublic, withUser } from "@web/lib/api"
import { db } from "@web/db"
import { SportsError } from "./store.ts"
import { getCurrentUserId } from "@web/lib/auth"
import { sportsMode } from "./flag.ts"
import { sportsAccessFor } from "./access.ts"
import { SPORTS_HOLD_MESSAGE, SPORTS_HOLD_UNTIL, sportsOnHold } from "./maintenance.ts"

/** While sports is on hold (maintenance.ts) a route answers this before any database work. */
function holdResponse() {
  return NextResponse.json(
    { error: SPORTS_HOLD_MESSAGE, code: "SPORTS_ON_HOLD", until: SPORTS_HOLD_UNTIL.toISOString() },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  )
}

/** Every sports route is invisible (404, same body as a missing route) unless the flag allows this user. */
async function assertAccess(userId: string | null) {
  if (!(await sportsAccessFor(userId))) throw new ApiError("Not found", 404)
}

const shape = <T>(fn: () => Promise<T>) =>
  fn().catch((error) => {
    if (error instanceof SportsError) throw new ApiError(error.message, error.status)
    throw error
  })

/** `duringHold`: the one read the greyed-out league list needs while sports is on hold. Every other route answers holdResponse. */
export function withSportsUser<T>(handler: (userId: string, request: Request, context: T) => Promise<Response>, { duringHold = false }: { duringHold?: boolean } = {}) {
  return withUser<T>(async (userId, request, context) => {
    if (!duringHold && sportsOnHold()) return holdResponse()
    await assertAccess(userId)
    return shape(() => handler(userId, request, context))
  })
}

/** Flag-gated like every sports route, but readable signed out: for public, non-personal data that a CDN may cache. */
export function withSportsPublic<T>(handler: (request: Request, context: T) => Promise<Response>) {
  return withPublic<T>(async (request, context) => {
    if (sportsOnHold()) return holdResponse()
    // In admin mode the caller must be a signed-in admin, and the response must never sit in a shared CDN cache
    // (a cached admin response could otherwise be served to anyone requesting the same URL).
    const admin = sportsMode() === "admin"
    await assertAccess(admin ? await getCurrentUserId() : null)
    const response = await shape(() => handler(request, context))
    if (admin) response.headers.set("Cache-Control", "private, no-store")
    return response
  })
}

/**
 * Cron stays allowed in every non-off mode (CRON_SECRET protected) so publishing, settlement and the worker keep running while only admins can see sports.
 * On hold it answers 200 "paused" without touching the database, so the scheduler neither retries nor reports a failure, and the
 * live odds watchdog reads "paused" as healthy.
 */
export function withSportsCron<T>(handler: (request: Request, context: T) => Promise<Response>) {
  return withPublic<T>(async (request, context) => {
    if (sportsMode() === "off") throw new ApiError("Not found", 404)
    assertCronAuthorized(request)
    if (sportsOnHold()) return NextResponse.json({ status: "paused", reason: "sports on hold", until: SPORTS_HOLD_UNTIL.toISOString() })
    return shape(() => handler(request, context))
  })
}

export { db }
