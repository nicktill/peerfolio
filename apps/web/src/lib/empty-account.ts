type AccountShape = {
  source: "plaid" | "manual"
  balance: number
  positions: readonly unknown[]
  holdingCount?: number
  holdingsPending?: boolean
}

/** A linked account with no balance and no holdings. Manual accounts are never "empty": the owner made them. */
export function isEmptyLinkedAccount(a: AccountShape) {
  return a.source === "plaid" && a.balance === 0 && a.positions.length === 0 && !(a.holdingCount && a.holdingCount > 0) && !a.holdingsPending
}
