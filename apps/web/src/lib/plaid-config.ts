/** Keep environment selection explicit: an invalid setting must never silently hit another environment. */
export function plaidEnvironment(value: string | undefined): "sandbox" | "production" {
  if (!value || value === "sandbox") return "sandbox"
  if (value === "production") return "production"
  throw new Error("PLAID_ENV must be sandbox or production")
}

export function plaidConfigured(env: Record<string, string | undefined>): boolean {
  return Boolean(env.PLAID_CLIENT_ID?.trim() && env.PLAID_SECRET?.trim())
}
