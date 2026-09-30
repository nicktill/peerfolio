type ExpandableAccount = { id: string; positions: readonly unknown[] }

/** Capture defaults once: importing or removing holdings must not toggle a panel. */
export function reconcileAccountExpansion(
  previous: Record<string, boolean>,
  accounts: readonly ExpandableAccount[],
): Record<string, boolean> {
  let next = previous
  for (const account of accounts) {
    if (Object.hasOwn(previous, account.id)) continue
    if (next === previous) next = { ...previous }
    next[account.id] = account.positions.length > 0 && account.positions.length <= 5
  }
  // Keep pending newly-created account IDs while the refresh is in flight.
  return next
}
