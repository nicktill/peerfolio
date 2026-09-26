import { Configuration, PlaidApi, PlaidEnvironments } from "plaid"

/**
 * Plaid retired the `development` environment; sandbox and production are the
 * only targets. Defaults to sandbox so a misconfigured deploy can never
 * accidentally touch real financial institutions.
 */
function getPlaidEnv(): "sandbox" | "production" {
  return process.env.PLAID_ENV === "production" ? "production" : "sandbox"
}


let cached: PlaidApi | null = null

export function getPlaidClient(): PlaidApi {
  if (cached) return cached

  const clientId = process.env.PLAID_CLIENT_ID
  const secret = process.env.PLAID_SECRET
  if (!clientId || !secret) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must be set.")
  }

  cached = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[getPlaidEnv()],
      baseOptions: {
        headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret },
      },
    }),
  )
  return cached
}

/** Narrows an unknown thrown value to a Plaid API error code, if it is one. */
export function plaidErrorCode(error: unknown): string | null {
  const data = (error as { response?: { data?: { error_code?: string } } })?.response?.data
  return data?.error_code ?? null
}

export function plaidErrorMessage(error: unknown): string {
  const data = (error as { response?: { data?: { error_message?: string; error_code?: string } } })?.response?.data
  return data?.error_message ?? data?.error_code ?? "Plaid request failed"
}

/** Item-level errors that mean the user must re-authenticate through Link. */
const REAUTH_CODES = new Set(["ITEM_LOGIN_REQUIRED", "PENDING_EXPIRATION", "PENDING_DISCONNECT"])

export const isReauthRequired = (code: string | null) => !!code && REAUTH_CODES.has(code)
