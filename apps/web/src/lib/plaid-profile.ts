/**
 * `trial2` is the second free Trial team. It is never selectable by configuration: newPlaidProfile can not return it,
 * only the production budget logic assigns it (when pool 1's Items are used up), and stored Items remember it.
 */
export type PlaidProfile = "trial" | "trial2" | "sandbox" | "paid"
type Env = Record<string, string | undefined>

/**
 * The paid (pay-as-you-go) Plaid team is hard-disabled in code, whatever the deployment env says.
 * Re-enabling it requires a code change here (remove these guards and ship a reviewed release);
 * setting PLAID_CONNECTION_PROFILE=paid in Vercel only produces this error.
 */
/**
 * RUNBOOK: never unset or change PLAID_TRIAL_CLIENT_ID_2 / PLAID_TRIAL_SECRET_2 while Items linked to pool 2 exist.
 * Those Items remember the `trial2` profile and can only be synced, refreshed or removed with its credentials. If the
 * credentials go missing, each such Item fails on its own (logged, flagged in the admin view) while everything else keeps
 * working, and their Plaid-side connections keep counting against the second team until the credentials are restored.
 */
export class PlaidProfileUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PlaidProfileUnavailableError"
  }
}

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
    if (!clientId || !secret) throw new PlaidProfileUnavailableError("Plaid sandbox credentials are not configured")
    return { clientId, secret }
  }
  if (profile === "trial2") {
    const clientId = env.PLAID_TRIAL_CLIENT_ID_2?.trim()
    const secret = env.PLAID_TRIAL_SECRET_2?.trim()
    if (!clientId || !secret) throw new PlaidProfileUnavailableError("Plaid trial2 credentials are not configured")
    if (clientId === env.PLAID_CLIENT_ID?.trim()) throw new Error("Trial 2 must use a different Plaid team from paid")
    if (clientId === env.PLAID_TRIAL_CLIENT_ID?.trim() || secret === env.PLAID_TRIAL_SECRET?.trim()) throw new Error("Trial 2 must use a different Plaid team from Trial")
    if (env.PLAID_ENV !== "production") throw new Error("Trial 2 requires PLAID_ENV=production")
    return { clientId, secret }
  }
  const clientId = env.PLAID_TRIAL_CLIENT_ID?.trim()
  const secret = env.PLAID_TRIAL_SECRET?.trim()
  if (!clientId || !secret) throw new PlaidProfileUnavailableError("Plaid trial credentials are not configured")
  if (clientId === env.PLAID_CLIENT_ID?.trim()) throw new Error("Trial must use a different Plaid team from paid")
  if (env.PLAID_ENV !== "production") throw new Error("Trial requires PLAID_ENV=production")
  return { clientId, secret }
}

/**
 * Profiles whose credentials may have signed an incoming webhook, in the order to try them: the profile new connections
 * use here (sandbox outside production), then trial2 when it is configured. Paid is never consulted.
 */
export function verificationProfiles(env: Env): PlaidProfile[] {
  const profiles: PlaidProfile[] = []
  try { profiles.push(newPlaidProfile(env)) } catch { /* a disabled or invalid profile has no key to try */ }
  if (trial2Configured(env) && !profiles.includes("trial2")) profiles.push("trial2")
  return profiles
}

/**
 * Pool 2 is OFF unless PLAID_TRIAL_2_ENABLED is exactly "1" (anything else, including "true", is off) AND its credentials are valid.
 * Credentials alone never route a single new connection to the second team; they only keep existing pool-2 Items working
 * (sync, webhooks, removal), which needs no flag. Only the budget logic reads this.
 */
export function trial2Enabled(env: Env): boolean {
  return env.PLAID_TRIAL_2_ENABLED === "1" && trial2Configured(env)
}

/** Whether the second Trial team is fully and validly configured. Pool 2 does not exist otherwise. */
export function trial2Configured(env: Env): boolean {
  try { plaidCredentials(env, "trial2"); return true } catch { return false }
}

/**
 * Admin-only hint for matching a team against the Plaid Dashboard: first 4 and last 4 characters, never more.
 * Ids too short to hide a middle show nothing. The secret is never part of this.
 */
export function maskClientId(clientId: string): string {
  const id = clientId.trim()
  return id.length >= 12 ? `${id.slice(0, 4)}…${id.slice(-4)}` : "••••"
}

/** Which Trial pools have valid credentials and a masked client id to recognise them by. Nothing for the paid pair. */
export function trialCredentialSummary(env: Env): { pool: 1 | 2; profile: "trial" | "trial2"; configured: boolean; enabled: boolean; state: "enabled" | "disabled" | "not_set"; clientId?: string }[] {
  return ([[1, "trial"], [2, "trial2"]] as const).map(([pool, profile]) => {
    try {
      const clientId = maskClientId(plaidCredentials(env, profile).clientId)
      const enabled = pool === 1 || trial2Enabled(env)
      return { pool, profile, configured: true, enabled, state: enabled ? "enabled" : "disabled", clientId } as const
    } catch {
      return { pool, profile, configured: false, enabled: false, state: "not_set" } as const
    }
  })
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
  if (data.version !== 1 || !["trial", "trial2", "sandbox", "paid"].includes(data.profile) || typeof data.token !== "string" || !data.token) {
    throw new Error("Invalid stored Plaid credential profile")
  }
  return { profile: data.profile, token: data.token }
}
