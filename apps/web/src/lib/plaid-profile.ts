export type PlaidProfile = "trial" | "paid"
type Env = Record<string, string | undefined>

/** New production connections fail closed to Trial unless explicitly switched. */
export function newPlaidProfile(env: Env): PlaidProfile {
  const value = env.PLAID_CONNECTION_PROFILE ?? (env.PLAID_ENV === "production" ? "trial" : "paid")
  if (value !== "trial" && value !== "paid") throw new Error("PLAID_CONNECTION_PROFILE must be trial or paid")
  return value
}

export function plaidCredentials(env: Env, profile: PlaidProfile) {
  const clientId = (profile === "trial" ? env.PLAID_TRIAL_CLIENT_ID : env.PLAID_CLIENT_ID)?.trim()
  const secret = (profile === "trial" ? env.PLAID_TRIAL_SECRET : env.PLAID_SECRET)?.trim()
  if (!clientId || !secret) throw new Error(`Plaid ${profile} credentials are not configured`)
  if (profile === "trial" && clientId === env.PLAID_CLIENT_ID?.trim()) throw new Error("Trial must use a different Plaid team from paid")
  if (profile === "trial" && env.PLAID_ENV !== "production") throw new Error("Trial requires PLAID_ENV=production")
  return { clientId, secret }
}

/** Stored inside the existing encrypted token field; no plaintext team marker. */
export function encodePlaidToken(token: string, profile: PlaidProfile): string {
  return JSON.stringify({ version: 1, profile, token })
}

export function decodePlaidToken(value: string): { profile: PlaidProfile; token: string } {
  // Older rows predate Trial routing and belong to the original paid credentials.
  if (!value.startsWith("{")) return { profile: "paid", token: value }
  const data = JSON.parse(value)
  if (data.version !== 1 || !["trial", "paid"].includes(data.profile) || typeof data.token !== "string" || !data.token) {
    throw new Error("Invalid stored Plaid credential profile")
  }
  return { profile: data.profile, token: data.token }
}
