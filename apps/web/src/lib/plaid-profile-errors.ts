import { ApiError } from "@web/lib/api"
import { PlaidProfileUnavailableError } from "@web/lib/plaid-profile"

/** Turns "this Item's Trial team has no credentials" into one logged, per-Item failure instead of an anonymous 500. */
export function rethrowIfProfileUnavailable(error: unknown, context: Record<string, unknown>): void {
  if (!(error instanceof PlaidProfileUnavailableError)) return
  console.error(JSON.stringify({ level: "error", event: "plaid.item_profile_unavailable", ...context, reason: error.message }))
  throw new ApiError("This connection's Plaid credentials aren't configured right now. Please contact support.", 503, { code: "PLAID_PROFILE_UNAVAILABLE" })
}
