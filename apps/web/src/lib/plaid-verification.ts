type ItemHealth = { id: string; status: string; lastSyncedAt: Date | string | null }
type AccountHealth = { source: string; itemId: string | null }
const MAX_SYNC_AGE_MS = 48 * 60 * 60 * 1000

/** Only fresh, successfully imported institution data may qualify for a public rank. */
export function hasVerifiedAccounts(accounts: AccountHealth[], items: ItemHealth[], now = Date.now()): boolean {
  if (accounts.length === 0) return false
  const byId = new Map(items.map((item) => [item.id, item]))
  return accounts.every((account) => {
    if (account.source !== "plaid" || !account.itemId) return false
    const item = byId.get(account.itemId)
    if (!item || item.status !== "active" || !item.lastSyncedAt) return false
    const synced = new Date(item.lastSyncedAt).getTime()
    return Number.isFinite(synced) && synced <= now && now - synced <= MAX_SYNC_AGE_MS
  })
}
