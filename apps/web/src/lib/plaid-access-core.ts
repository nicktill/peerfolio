/** Server settings are deliberately deny-by-default. */
export function isAdminEmail(email: string, allowlist: string | undefined): boolean {
  const normalized = email.trim().toLowerCase()
  return !!normalized && (allowlist ?? "").split(",").some((value) => value.trim().toLowerCase() === normalized)
}

function nonnegativeInteger(value: string | undefined, fallback: number, name: string): number {
  if (value == null || value.trim() === "") return fallback
  if (!/^\d+$/.test(value.trim())) throw new Error(`${name} must be a nonnegative integer`)
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`${name} must be a nonnegative safe integer`)
  return parsed
}

export function productionBudgetSettings(env: Record<string, string | undefined>) {
  const configuredLimit = nonnegativeInteger(env.PLAID_PRODUCTION_ITEM_LIMIT, 10, "PLAID_PRODUCTION_ITEM_LIMIT")
  // Production is Trial-only (the paid profile is disabled in code), so the 10 Item cap always applies.
  const trial = env.PLAID_ENV === "production"
  return {
    limit: trial ? Math.min(10, configuredLimit) : configuredLimit,
    previouslyUsed: nonnegativeInteger(env.PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED, 0, "PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED"),
  }
}
