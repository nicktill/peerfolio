import "server-only"
import { ApiError, assertCronAuthorized, withPublic, withUser } from "@web/lib/api"
import { db } from "@web/db"
import { SportsError } from "./store.ts"
import { sportsEnabled } from "./flag.ts"

/** Every sports route is invisible (404) unless the flag is on. */
function assertEnabled() {
  if (!sportsEnabled()) throw new ApiError("Not found", 404)
}

const shape = <T>(fn: () => Promise<T>) =>
  fn().catch((error) => {
    if (error instanceof SportsError) throw new ApiError(error.message, error.status)
    throw error
  })

export function withSportsUser<T>(handler: (userId: string, request: Request, context: T) => Promise<Response>) {
  return withUser<T>((userId, request, context) => {
    assertEnabled()
    return shape(() => handler(userId, request, context))
  })
}

export function withSportsCron<T>(handler: (request: Request, context: T) => Promise<Response>) {
  return withPublic<T>((request, context) => {
    assertEnabled()
    assertCronAuthorized(request)
    return shape(() => handler(request, context))
  })
}

export { db }
