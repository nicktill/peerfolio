/** Small, injectable helpers shared by the sync and its regression tests. */
export async function retryPlaid<T>(request: () => Promise<T>, wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), deadline = Infinity): Promise<T> {
  const checkBudget = (extra = 0) => { if (Date.now() + extra >= deadline) throw new Error("Plaid sync deadline exceeded") }
  for (let attempt = 0; ; attempt++) {
    checkBudget()
    try { const result = await request(); checkBudget(); return result } catch (error) {
      checkBudget()
      const response = (error as { response?: { status?: number; data?: { error_code?: string } } } | null)?.response
      const code = response?.data?.error_code
      const networkCode = (error as { code?: string } | null)?.code
      const retryable = code === "PRODUCT_NOT_READY" || code === "INSTITUTION_NOT_RESPONDING" || response?.status === 429 || (response?.status ?? 0) >= 500
        || ["ECONNABORTED", "ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"].includes(networkCode ?? "")
      if (!retryable || attempt >= 2) throw error
      const delay = 1000 * 2 ** attempt
      checkBudget(delay)
      await wait(delay)
    }
  }
}

export type InvestmentFlow = { investment_transaction_id: string; account_id: string; amount: number; type: string; subtype?: string | null; date?: string }
const EXTERNAL = new Set(["deposit", "withdrawal", "contribution", "distribution", "rollover", "transfer"])

/** Investments exposes at most 24 months; older Items must keep valid requests. */
export function investmentHistoryStart(createdAt: Date, now = new Date()): string {
  const earliest = new Date(now)
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 2)
  return new Date(Math.max(createdAt.getTime(), earliest.getTime())).toISOString().slice(0, 10)
}

export function externalFlow(tx: InvestmentFlow): number {
  // `type=transfer` also includes splits/exercises: only known external subtypes count.
  if (!EXTERNAL.has((tx.subtype ?? "").toLowerCase()) || tx.type === "cancel") return 0
  if (!Number.isFinite(tx.amount)) throw new Error("Invalid investment transaction amount")
  // Plaid combines a retirement contribution with its security purchase:
  // buy/contribution uses purchase (positive) direction, but adds portfolio capital.
  if (tx.type === "buy" && tx.subtype?.toLowerCase() === "contribution") return Number(Math.abs(tx.amount).toFixed(4))
  return Number((-tx.amount).toFixed(4))
}

export async function investmentPages<T>(fetchPage: (offset: number) => Promise<{ investment_transactions: T[]; total_investment_transactions: number }>): Promise<T[]> {
  const rows: T[] = []
  let total = Infinity
  let pages = 0
  const transactionIds = new Set<string>()
  while (rows.length < total) {
    if (++pages > 200) throw new Error("Investment transaction pagination limit exceeded")
    const page = await fetchPage(rows.length)
    const nextTotal = page.total_investment_transactions
    if (!Number.isSafeInteger(nextTotal) || nextTotal < 0) throw new Error("Invalid investment transaction total")
    if (Number.isFinite(total) && nextTotal !== total) throw new Error("Investment transactions changed during pagination; retry the sync")
    total = nextTotal
    if (page.investment_transactions.length === 0 && rows.length < total) throw new Error("Incomplete investment transaction response")
    for (const row of page.investment_transactions) {
      if (typeof row === "object" && row !== null && "investment_transaction_id" in row && typeof row.investment_transaction_id === "string") {
        if (transactionIds.has(row.investment_transaction_id)) throw new Error("Duplicate investment transaction across pages; retry the sync")
        transactionIds.add(row.investment_transaction_id)
      }
    }
    rows.push(...page.investment_transactions)
    if (rows.length > total) throw new Error("Investment transactions exceed reported total")
  }
  return rows
}

export function flowChanges(transactions: InvestmentFlow[], previous: Map<string, { amount: number; baseline: boolean; date?: string | null; accountId?: string }>, baselineAccounts: Set<string>, baselineDates = new Map<string, string>(), completeWindow?: { start: string; end: string }) {
  const unique = new Map<string, InvestmentFlow>()
  for (const tx of transactions) {
    const duplicate = unique.get(tx.investment_transaction_id)
    if (duplicate && (duplicate.account_id !== tx.account_id || duplicate.amount !== tx.amount || duplicate.type !== tx.type || duplicate.subtype !== tx.subtype)) {
      throw new Error("Conflicting investment transaction duplicates; retry the sync")
    }
    unique.set(tx.investment_transaction_id, tx)
  }
  const entries = [...unique.values()].map((tx) => {
    const old = previous.get(tx.investment_transaction_id)
    const baselineDate = baselineDates.get(tx.account_id)
    const baseline = old?.baseline ?? (baselineAccounts.has(tx.account_id) || !!(tx.date && baselineDate && tx.date <= baselineDate))
    const amount = baseline ? 0 : externalFlow(tx)
    return { transactionId: tx.investment_transaction_id, accountId: tx.account_id, amount, baseline, date: tx.date ?? old?.date ?? null, delta: amount - (old?.amount ?? 0) }
  })
  // Plaid can remove a canceled transaction entirely. Only reconcile a window
  // fetched in full; history older than the 24-month API limit must stay intact.
  if (completeWindow) for (const [id, old] of previous) {
    if (!unique.has(id) && old.date && old.date >= completeWindow.start && old.date <= completeWindow.end) {
      entries.push({ transactionId: id, accountId: old.accountId ?? "", amount: 0, baseline: old.baseline, date: old.date, delta: -old.amount })
    }
  }
  return { entries, net: entries.reduce((sum, entry) => sum + entry.delta, 0) }
}
