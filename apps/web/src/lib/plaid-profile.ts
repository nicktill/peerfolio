export type PlaidProfile = "trial" | "sandbox" | "paid"
type Env = Record<string, string | undefined>

/**
 * The paid (pay-as-you-go) Plaid team is hard-disabled in code, whatever the deployment env says.
 * Re-enabling it requires a code change here (remove these guards and ship a reviewed release);
 * setting PLAID_CONNECTION_PROFILE=paid in Vercel only produces this error.
 */
const PAID_DISABLED = "Paid Plaid credentials are disabled in this build; re-enabling them requires a code change"

/**
 * Which credentials new connections use. Unset means Trial against production Plaid, or the free
 * Sandbox otherwise. Anything except `trial` fails closed, and `paid` is always rejected.
 */
export function newPlaidProfile(env: Env): PlaidProfile {
  const value = env.PLAID_CONNECTION_PROFILE
  if (value === undefined) return env.PLAID_ENV === "production" ? "trial" : "sandbox"
  if (value === "trial") return "trial"
  if (value === "paid") throw new Error(PAID_DISABLED)
  throw new Error("PLAID_CONNECTION_PROFILE must be trial")
}

export function plaidCredentials(env: Env, profile: PlaidProfile) {
  // Checked before any credential variable is read: the paid keys must never be touched.
  if (profile === "paid") throw new Error(PAID_DISABLED)
  if (profile === "sandbox") {
    // Sandbox is Plaid's free fake-bank environment. Its keys live in the PLAID_CLIENT_ID/PLAID_SECRET
    // slots, so refuse that slot outright whenever the target could be production.
    if (env.PLAID_ENV !== undefined && env.PLAID_ENV !== "sandbox") throw new Error("Sandbox credentials require PLAID_ENV=sandbox")
    const clientId = env.PLAID_CLIENT_ID?.trim()
    const secret = env.PLAID_SECRET?.trim()
    if (!clientId || !secret) throw new Error("Plaid sandbox credentials are not configured")
    return { clientId, secret }
  }
  const clientId = env.PLAID_TRIAL_CLIENT_ID?.trim()
  const secret = env.PLAID_TRIAL_SECRET?.trim()
  if (!clientId || !secret) throw new Error("Plaid trial credentials are not configured")
  if (clientId === env.PLAID_CLIENT_ID?.trim()) throw new Error("Trial must use a different Plaid team from paid")
  if (env.PLAID_ENV !== "production") throw new Error("Trial requires PLAID_ENV=production")
  return { clientId, secret }
}

/** Stored inside the existing encrypted token field; no plaintext team marker. */
export function encodePlaidToken(token: string, profile: PlaidProfile): string {
  return JSON.stringify({ version: 1, profile, token })
}

export function decodePlaidToken(value: string, env: Env = process.env): { profile: PlaidProfile; token: string } {
  // Older rows predate Trial routing. Outside production they are Sandbox tokens; in production
  // they belong to the original paid team, which is disabled.
  if (!value.startsWith("{")) return { profile: env.PLAID_ENV === "production" ? "paid" : "sandbox", token: value }
  const data = JSON.parse(value)
  if (data.version !== 1 || !["trial", "sandbox", "paid"].includes(data.profile) || typeof data.token !== "string" || !data.token) {
    throw new Error("Invalid stored Plaid credential profile")
  }
  return { profile: data.profile, token: data.token }
}
