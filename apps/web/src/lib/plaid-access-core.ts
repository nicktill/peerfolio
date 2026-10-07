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
  return {
    limit: nonnegativeInteger(env.PLAID_PRODUCTION_ITEM_LIMIT, 10, "PLAID_PRODUCTION_ITEM_LIMIT"),
    previouslyUsed: nonnegativeInteger(env.PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED, 0, "PLAID_PRODUCTION_ITEMS_PREVIOUSLY_USED"),
  }
}
