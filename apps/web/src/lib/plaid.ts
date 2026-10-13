import { Configuration, PlaidApi, PlaidEnvironments } from "plaid"
import { plaidEnvironment } from "@web/lib/plaid-config"

import { newPlaidProfile, plaidCredentials, type PlaidProfile } from "@web/lib/plaid-profile"

/**
 * Plaid retired the `development` environment; sandbox and production are the
 * only targets. Defaults to sandbox so a misconfigured deploy can never
 * accidentally touch real financial institutions.
 */
function getPlaidEnv(): "sandbox" | "production" {
  return plaidEnvironment(process.env.PLAID_ENV)
}

/** Whether new connections may be made. Mirrors NEXT_PUBLIC_PLAID_LINKING in next.config. */
export function plaidLinkingEnabled(): boolean {
  try { plaidCredentials(process.env, newPlaidProfile(process.env)) } catch { return false }
  return getPlaidEnv() === "production" || process.env.ENABLE_PLAID_SANDBOX === "true"
}

const clients = new Map<PlaidProfile, PlaidApi>()

export function getPlaidClient(profile: PlaidProfile = newPlaidProfile(process.env)): PlaidApi {
  const { clientId, secret } = plaidCredentials(process.env, profile)
  const existing = clients.get(profile)
  if (existing) return existing
  const client = new PlaidApi(new Configuration({
    basePath: PlaidEnvironments[getPlaidEnv()],
    baseOptions: { headers: { "PLAID-CLIENT-ID": clientId, "PLAID-SECRET": secret }, timeout: 15_000 },
  }))
  clients.set(profile, client)
  return client
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
