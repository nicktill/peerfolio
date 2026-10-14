/** Small, injectable helpers shared by the sync and its regression tests. */
/** How long to keep asking while Plaid is still extracting a new Item's data (it can take a minute or more). */
const NOT_READY_WAITS = [2000, 3000, 5000, 8000, 10000]

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
      const notReady = code === "PRODUCT_NOT_READY"
      if (!retryable || attempt >= (notReady ? NOT_READY_WAITS.length : 2)) throw error
      const delay = notReady ? NOT_READY_WAITS[attempt]! : 1000 * 2 ** attempt
      checkBudget(delay)
      await wait(delay)
    }
  }
}

export type HoldingLine = {
  account_id: string
  security_id: string
  quantity: number | null
  institution_value: number | null
  institution_price?: number | null
  cost_basis?: number | null
  iso_currency_code?: string | null
  unofficial_currency_code?: string | null
}

/**
 * Splits a broker's holdings into the lines we can show and the ones we can't (crypto and other
 * non-USD lines, margin debits and short positions, lines with no value). An odd line used to fail
 * the whole connection; now only that line is left out. The account's own balance is still the
 * source of truth for net worth and returns, so skipping a line never changes those.
 *
 * Retirement plans often report a position with a price but no total value, or a total but no
 * quantity; the missing figure is derived from the other two instead of dropping the line.
 */
export function splitUsableHoldings<T extends HoldingLine>(list: T[], accountCurrencies = new Map<string, string | null | undefined>()): { kept: T[]; skipped: { line: T; reason: string }[]; assumedCurrency: number } {
  const kept: T[] = []
  const skipped: { line: T; reason: string }[] = []
  let assumedCurrency = 0
  const finite = (n: number | null | undefined): n is number => n != null && Number.isFinite(n)
  for (const raw of list) {
    const line = { ...raw }
    const price = line.institution_price
    if (!finite(line.institution_value) && finite(line.quantity) && finite(price)) line.institution_value = Number((line.quantity * price).toFixed(4))
    if (!finite(line.quantity) && finite(line.institution_value) && finite(price) && price > 0) line.quantity = Number((line.institution_value / price).toFixed(8))
    const value = line.institution_value
    const quantity = line.quantity
    // Some institutions omit the holding currency; inherit only a validated account currency.
    const currency = line.iso_currency_code ?? accountCurrencies.get(line.account_id)
    const reason =
      currency !== "USD" || line.unofficial_currency_code ? "not in US dollars"
        : value == null || !Number.isFinite(value) || quantity == null || !Number.isFinite(quantity) ? "no value reported"
          : value < 0 || quantity < 0 ? "short or margin position"
            : null
    if (reason) skipped.push({ line: raw, reason })
    else {
      if (raw.iso_currency_code == null) assumedCurrency++
      kept.push({ ...line, iso_currency_code: currency })
    }
  }
  return { kept, skipped, assumedCurrency }
}

/** Counts per reason, for the one-line sync log. */
export function countByReason(skipped: { reason: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const { reason } of skipped) counts[reason] = (counts[reason] ?? 0) + 1
  return counts
}

/**
 * A name worth showing for a security Plaid knows no ticker for (401(k) funds, CUSIP-only mutual
 * funds, cash sweeps): its name, else its ticker, CUSIP, ISIN or SEDOL, else a plain label.
 */
export function securityDisplayName(s: { name?: string | null; ticker_symbol?: string | null; cusip?: string | null; isin?: string | null; sedol?: string | null; type?: string | null; is_cash_equivalent?: boolean | null }): string {
  const clean = (v?: string | null) => (v && v.trim() ? v.trim() : null)
  return clean(s.name) ?? clean(s.ticker_symbol) ?? clean(s.cusip) ?? clean(s.isin) ?? clean(s.sedol) ?? (s.type === "cash" || s.is_cash_equivalent ? "Cash" : "Unnamed security")
}

/**
 * Accounts that carry a balance but came back with no position lines at all. Plaid answers
 * "no holdings" with a 200 while it is still extracting a new Item's data, so this is a pending
 * state to retry and to show, never a complete sync. Accounts whose lines were all left out on
 * purpose (crypto, shorts) are not listed: more waiting would not change them.
 */
export function accountsAwaitingHoldings(accounts: { account_id: string; balance: number | null }[], rawLineCounts: Map<string, number>): string[] {
  return accounts.filter((a) => a.balance != null && Number.isFinite(a.balance) && a.balance > 0 && (rawLineCounts.get(a.account_id) ?? 0) === 0).map((a) => a.account_id)
}

/** Combines lines for the same security in the same account (separate lots, sub-positions) into one. */
export function mergeDuplicateHoldings<T extends HoldingLine>(list: T[]): T[] {
  const merged = new Map<string, T>()
  for (const line of list) {
    const key = `${line.account_id}\u0000${line.security_id}`
    const existing = merged.get(key)
    if (!existing) {
      merged.set(key, { ...line })
      continue
    }
    existing.quantity = (existing.quantity ?? 0) + (line.quantity ?? 0)
    existing.institution_value = (existing.institution_value ?? 0) + (line.institution_value ?? 0)
    if (existing.cost_basis != null || line.cost_basis != null) existing.cost_basis = (existing.cost_basis ?? 0) + (line.cost_basis ?? 0)
  }
  return [...merged.values()]
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
