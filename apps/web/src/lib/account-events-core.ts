/** Pure half of the account history, kept free of database imports so it can be tested. */

export type AccountEventAction =
  | "account_created"
  | "account_updated"
  | "account_deleted"
  | "position_set"
  | "positions_imported"
  | "position_removed"

export type AccountEventInput = {
  action: AccountEventAction
  accountId: string
  accountName?: string | null
  /** What changed, in plain values: balances, tickers, quantities, counts. */
  detail?: Record<string, unknown>
}

const money = (v: number) => (Number.isFinite(v) ? v : 0).toFixed(4)

/** The row to insert: money as fixed-point strings, undefined detail values dropped. */
export function buildAccountEvent(userId: string, investableBefore: number, investableAfter: number, input: AccountEventInput) {
  const detail = Object.fromEntries(Object.entries(input.detail ?? {}).filter(([, v]) => v !== undefined))
  return {
    userId,
    accountId: input.accountId,
    accountName: input.accountName ?? null,
    action: input.action,
    investableBefore: money(investableBefore),
    investableAfter: money(investableAfter),
    detail,
  }
}
