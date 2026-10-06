import { withPortfolioWrite } from "@web/db"
import { NextResponse } from "next/server"
import { getCurrentUserId } from "@web/lib/auth"

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
 * Wraps a route handler with auth and uniform error shaping.
 *
 * Unexpected errors are logged server-side and reported to the client as a
 * generic message — Plaid failures in particular can echo institution detail
 * we don't want to forward verbatim.
 */
export function withUser<T>(handler: (userId: string, request: Request, context: T) => Promise<Response>) {
  return async (request: Request, context: T): Promise<Response> => {
    const userId = await getCurrentUserId()
    if (!userId) return unauthorized()

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
  if (request.headers.get("authorization") !== `Bearer ${secret}`) throw new ApiError("Forbidden", 403)
}

/** Auth/error handling stays outside the transaction so errors roll it back. */
export function withPortfolioUser<T, P = void>(
  handler: (userId: string, request: Request, context: T, prepared: P) => Promise<Response>,
  prepare?: (userId: string, request: Request, context: T) => Promise<P>,
) {
  return withUser<T>(async (userId, request, context) => {
    // Provider calls must finish before reserving a DB connection/lock.
    const prepared = await prepare?.(userId, request.clone(), context)
    return withPortfolioWrite(userId, async () => {
      const { revalueUser } = await import("@web/lib/positions")
      await revalueUser(userId)
      return handler(userId, request.clone(), context, prepared as P)
    })
  })
}
