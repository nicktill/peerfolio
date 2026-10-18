import { timingSafeEqual } from "node:crypto"
import { NextResponse } from "next/server"
import { eq } from "drizzle-orm"
import { db, users } from "@web/db"
import { getCurrentUserId } from "@web/lib/auth"
import { requestIsSameOrigin } from "@web/lib/request-origin"
import { createTtlSet } from "@web/lib/ttl-set"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number = 400,
    /** Extra fields merged into the error body, e.g. ticker suggestions. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const unauthorized = () => NextResponse.json({ error: "Not signed in" }, { status: 401 })

/**
 * Users confirmed to still exist, for a minute. A signed session (JWT) outlives the account it was issued for, so without
 * this a deleted user's cookie would keep working; the cache keeps it to one cheap lookup per user per minute per instance.
 */
const knownUsers = createTtlSet({ ttlMs: 60_000, maxEntries: 5_000 })

/** Call after deleting an account so this instance stops honouring its session immediately. */
export const forgetUser = (userId: string) => knownUsers.delete(userId)

async function userStillExists(userId: string): Promise<boolean> {
  if (knownUsers.has(userId)) return true
  const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { id: true } })
  if (!row) return false
  knownUsers.add(userId)
  return true
}

/**
 * Wraps a route handler with auth, a same-origin check for writes, and uniform error shaping.
 *
 * Unexpected errors are logged server-side and reported to the client as a
 * generic message — Plaid failures in particular can echo institution detail
 * we don't want to forward verbatim.
 */
export function withUser<T>(handler: (userId: string, request: Request, context: T) => Promise<Response>) {
  return async (request: Request, context: T): Promise<Response> => {
    // Writes must come from this site's own pages (Origin / Sec-Fetch-Site), not another site riding the session cookie.
    if (!requestIsSameOrigin(request)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const userId = await getCurrentUserId()
    if (!userId) return unauthorized()
    if (!(await userStillExists(userId))) return unauthorized()

    try {
      return await handler(userId, request, context)
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ ...error.details, error: error.message }, { status: error.status })
      }
      console.error("[api] unhandled error", error)
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
    }
  }
}

/** Same shaping as {@link withUser}, for routes that allow signed-out access. */
export function withPublic<T>(handler: (request: Request, context: T) => Promise<Response>) {
  return async (request: Request, context: T): Promise<Response> => {
    try {
      return await handler(request, context)
    } catch (error) {
      if (error instanceof ApiError) {
        return NextResponse.json({ ...error.details, error: error.message }, { status: error.status })
      }
      console.error("[api] unhandled error", error)
      return NextResponse.json({ error: "Something went wrong" }, { status: 500 })
    }
  }
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T
  } catch {
    throw new ApiError("Expected a JSON body")
  }
}

/**
 * Guards cron endpoints. Vercel Cron sends CRON_SECRET as a bearer token;
 * absent a configured secret the route refuses rather than running open.
 */
export function assertCronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) throw new ApiError("CRON_SECRET is not configured", 500)
  // Constant-time compare, so the secret can't be recovered from response timing.
  const given = Buffer.from(request.headers.get("authorization") ?? "")
  const wanted = Buffer.from(`Bearer ${secret}`)
  if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new ApiError("Forbidden", 403)
}
