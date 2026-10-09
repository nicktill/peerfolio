import { and, eq, inArray, isNull, min, ne, sql } from "drizzle-orm"
import type { AccountBase, Holding as PlaidHolding, Security as PlaidSecurity } from "plaid"
import { db, holdings, accounts, plaidItems, portfolioSnapshots, securities, plaidInvestmentFlows } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, isReauthRequired, plaidErrorCode } from "@web/lib/plaid"
import { flowChanges, investmentHistoryStart, investmentPages, mergeDuplicateHoldings, retryPlaid, splitUsableHoldings } from "@web/lib/plaid-sync-core"
import { keepsEntryValue } from "@web/lib/ranges"
import { categorizeAccount, type AccountCategory } from "@web/lib/account-category"
import { accountBalance } from "@web/lib/account-balance"
import { assertPlaidActive, plaidPaused } from "@web/lib/plaid-switch"

export { categorizeAccount, type AccountCategory }

/** Categories that count toward the investable base used for league returns. */
const INVESTABLE: AccountCategory[] = ["investment"]
const LIABILITY: AccountCategory[] = ["credit", "loan"]

const num = (v: string | null | undefined) => (v == null ? 0 : Number(v))

/* ------------------------------------------------------------------ *
 * Item sync
 * ------------------------------------------------------------------ */

export type SyncResult = {
  itemId: string
  accounts: number
  holdings: number
  status: "active" | "needs_reauth" | "error"
  errorCode?: string
}

/**
 * Pulls balances and holdings for one Item into our tables.
 *
 * This is the only place an access token is decrypted. Callers pass an item id
 * they have already confirmed belongs to the requesting user.
 */
type SyncDb = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0]
class SyncValidationError extends Error {
  constructor(readonly code: string, message: string) { super(message) }
}

export async function syncItem(itemRowId: string, deadline = Date.now() + 90_000): Promise<SyncResult> {
  await assertPlaidActive()
  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, itemRowId) })
  if (!item) throw new Error("Item not found")
  try {
    return await db.transaction(async (store) => {
      // All paths (cron, webhook, refresh, relink) serialize for this user's returns.
      await store.execute(sql`set local lock_timeout = '10s'`)
      await store.execute(sql`select pg_advisory_xact_lock(hashtext(${item.userId}))`)
      const current = await store.query.plaidItems.findFirst({ where: eq(plaidItems.id, item.id) })
      if (!current) throw new Error("Item not found")
      if (current.status === "disconnected") throw new Error("Item disconnected")
      const client = getPlaidClient()
      const accessToken = decrypt(current.accessToken)
      const { data } = await retryPlaid(() => client.accountsGet({ access_token: accessToken }), undefined, deadline)
      const priorAccounts = await store.select().from(accounts).where(eq(accounts.itemId, item.id))
      const existingIds = new Set(priorAccounts.filter((a) => a.isActive).map((a) => a.plaidAccountId))
      const priorById = new Map(priorAccounts.map((a) => [a.plaidAccountId, a]))
      const baselineDates = new Map(data.accounts.map((a) => [a.account_id, existingIds.has(a.account_id) ? priorById.get(a.account_id)?.plaidBaselineDate ?? today() : today()]))
      const baselineAccounts = new Set(data.accounts.filter((a) => baselineDates.get(a.account_id) === today()).map((a) => a.account_id))
      const incomingIds = new Set(data.accounts.map((a) => a.account_id))
      const hasInvestments = data.accounts.some((a) => categorizeAccount(a.type, a.subtype) === "investment")
      const investmentAccountIds = new Set(data.accounts.filter((a) => categorizeAccount(a.type, a.subtype) === "investment").map((a) => a.account_id))
      // Fetch everything before changing stored balances. A failure rolls the whole sync back.
      const holdingData = hasInvestments ? (await retryPlaid(() => client.investmentsHoldingsGet({ access_token: accessToken }), undefined, deadline)).data : null
      // accounts/get and holdings/get may be separate cached snapshots. Use the
      // balances accompanying the holdings so values and positions agree.
      const holdingsAccounts = new Map(holdingData?.accounts.map((a) => [a.account_id, a]) ?? [])
      const importedAccounts = data.accounts.map((a) => {
        if (categorizeAccount(a.type, a.subtype) !== "investment") return a
        const sameSnapshot = holdingsAccounts.get(a.account_id)
        if (!sameSnapshot) throw new Error("Incomplete investment account snapshot")
        if (sameSnapshot.balances.current == null || !Number.isFinite(sameSnapshot.balances.current)) throw new SyncValidationError("INVESTMENT_DATA_UNAVAILABLE", "Investment balance unavailable")
        if (sameSnapshot.balances.iso_currency_code !== "USD" || sameSnapshot.balances.unofficial_currency_code) throw new SyncValidationError("UNSUPPORTED_CURRENCY", "Investment balances must be in USD")
        return { ...a, balances: sameSnapshot.balances }
      })
      // One odd line (crypto, a margin debit, a short) must not take the whole connection down.
      if (holdingData) {
        const { kept, skipped } = splitUsableHoldings(holdingData.holdings)
        if (skipped.length) console.warn(`[plaid-sync] left out ${skipped.length} holding line(s) for item ${item.id}: ${[...new Set(skipped.map((s) => s.reason))].join(", ")}`)
        holdingData.holdings = mergeDuplicateHoldings(kept)
      }
      // Structural capital must use the same authoritative balances as the import.
      const structuralFlow = importedAccounts.filter((a) => baselineAccounts.has(a.account_id) && categorizeAccount(a.type, a.subtype) === "investment")
        .reduce((sum, a) => sum + accountBalance(a.balances.current ?? 0, "investment") - (existingIds.has(a.account_id) ? accountBalance(num(priorById.get(a.account_id)?.currentBalance), "investment") : 0), 0)
        - priorAccounts.filter((a) => a.isActive && a.category === "investment" && !incomingIds.has(a.plaidAccountId!))
          .reduce((sum, a) => sum + accountBalance(num(a.currentBalance), "investment"), 0)
      const transactionWindow = { start: investmentHistoryStart(current.createdAt), end: today() }
      const transactions = hasInvestments ? await investmentPages(async (offset) => {
        const { data: page } = await retryPlaid(() => client.investmentsTransactionsGet({
          access_token: accessToken,
          start_date: transactionWindow.start, end_date: transactionWindow.end,
          options: { count: 500, offset },
        }), undefined, deadline)
        return page
      }) : []
      const previous = await store.select().from(plaidInvestmentFlows).where(eq(plaidInvestmentFlows.itemId, item.id))
      // Closing/revoking an account is already neutralized through structuralFlow.
      // Its withdrawals and disappeared transactions must not neutralize it again.
      const changes = flowChanges(transactions.filter((tx) => investmentAccountIds.has(tx.account_id)), new Map(previous.filter((r) => investmentAccountIds.has(r.accountId)).map((r) => [r.transactionId, { amount: num(r.amount), baseline: r.baseline, date: r.transactionDate, accountId: r.accountId }])), current.flowsInitialized ? baselineAccounts : incomingIds, baselineDates, hasInvestments ? transactionWindow : undefined)
      const accountCount = await upsertPlaidAccounts(item.id, item.userId, importedAccounts, store)
      let holdingCount = 0
      if (holdingData) holdingCount = await syncHoldings(item.id, item.userId, holdingData, store)
      if (changes.entries.length) await store.insert(plaidInvestmentFlows).values(changes.entries.map((r) => ({
        transactionId: r.transactionId, itemId: item.id, accountId: r.accountId, amount: r.amount.toFixed(4), baseline: r.baseline, transactionDate: r.date,
      }))).onConflictDoUpdate({ target: plaidInvestmentFlows.transactionId, set: { amount: sqlExcluded("amount"), transactionDate: sqlExcluded("transaction_date") } })
      await store.update(plaidItems).set({ status: "active", errorCode: null, lastSyncedAt: new Date(), flowsInitialized: true }).where(eq(plaidItems.id, item.id))
      await writeDailySnapshot(item.userId, structuralFlow + changes.net, today(), store)
      return { itemId: item.id, accounts: accountCount, holdings: holdingCount, status: "active" }
    })
  } catch (error) {
    const code = error instanceof SyncValidationError ? error.code : plaidErrorCode(error)
    const status = isReauthRequired(code) ? "needs_reauth" : "error"
    // This timestamp means the last successful import, never the last attempt.
    await db.update(plaidItems).set({ status, errorCode: code ?? "SYNC_FAILED" }).where(and(eq(plaidItems.id, item.id), ne(plaidItems.status, "disconnected"), item.lastSyncedAt ? eq(plaidItems.lastSyncedAt, item.lastSyncedAt) : isNull(plaidItems.lastSyncedAt)))
    return { itemId: item.id, accounts: 0, holdings: 0, status, errorCode: code ?? undefined }
  }
}

async function upsertPlaidAccounts(itemRowId: string, userId: string, list: AccountBase[], store: SyncDb): Promise<number> {
  const incomingIds = list.map((a) => a.account_id)
  const previous = await store.select().from(accounts).where(eq(accounts.itemId, itemRowId))
  const removed = previous.filter((a) => !incomingIds.includes(a.plaidAccountId!)).map((a) => a.id)
  if (removed.length) {
    await store.update(accounts).set({ isActive: false }).where(inArray(accounts.id, removed))
    await store.delete(holdings).where(inArray(holdings.accountId, removed))
  }
  if (list.length === 0) return 0

  await store
    .insert(accounts)
    .values(
      list.map((a) => ({
        itemId: itemRowId,
        userId,
        plaidAccountId: a.account_id,
        name: a.name,
        officialName: a.official_name ?? null,
        mask: a.mask ?? null,
        type: String(a.type),
        subtype: a.subtype ? String(a.subtype) : null,
        category: categorizeAccount(a.type, a.subtype),
        currentBalance: a.balances.current?.toString() ?? null,
        availableBalance: a.balances.available?.toString() ?? null,
        isoCurrencyCode: a.balances.iso_currency_code ?? "USD",
        isActive: true,
        plaidBaselineDate: today(),
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: accounts.plaidAccountId,
      set: {
        name: sqlExcluded("name"),
        officialName: sqlExcluded("official_name"),
        mask: sqlExcluded("mask"),
        type: sqlExcluded("type"),
        subtype: sqlExcluded("subtype"),
        category: sqlExcluded("category"),
        currentBalance: sqlExcluded("current_balance"),
        availableBalance: sqlExcluded("available_balance"),
        isoCurrencyCode: sqlExcluded("iso_currency_code"),
        isActive: sqlExcluded("is_active"),
        plaidBaselineDate: sql`case when ${accounts.isActive} then coalesce(${accounts.plaidBaselineDate}, excluded.plaid_baseline_date) else excluded.plaid_baseline_date end`,
        updatedAt: sqlExcluded("updated_at"),
      },
    })

  return list.length
}

async function syncHoldings(itemRowId: string, userId: string, data: { accounts: { account_id: string }[]; holdings: PlaidHolding[]; securities: PlaidSecurity[] }, store: SyncDb): Promise<number> {
  await upsertSecurities(data.securities, store)
  // Scope to accounts in this response, including those with ZERO positions.
  const rows = await store.select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId }).from(accounts)
    .where(and(eq(accounts.itemId, itemRowId), eq(accounts.userId, userId), inArray(accounts.plaidAccountId, data.accounts.map((a) => a.account_id))))
  const idByPlaidId = new Map(rows.map((r) => [r.plaidAccountId, r.id]))
  if (data.holdings.some((h) => !idByPlaidId.has(h.account_id))) throw new Error("Holdings reference an unknown account")
  // Replace the authoritative holdings set atomically; failures roll back deletion.
  if (rows.length) await store.delete(holdings).where(inArray(holdings.accountId, rows.map((r) => r.id)))
  const values = data.holdings
    .map((h: PlaidHolding) => {
      const accountId = idByPlaidId.get(h.account_id)
      if (!accountId) return null
      return {
        accountId,
        userId,
        securityId: h.security_id,
        quantity: h.quantity?.toString() ?? null,
        costBasis: h.cost_basis?.toString() ?? null,
        institutionValue: h.institution_value?.toString() ?? null,
        isoCurrencyCode: h.iso_currency_code ?? "USD",
        updatedAt: new Date(),
      }
    })
    .filter((v): v is NonNullable<typeof v> => v !== null)

  if (values.length === 0) return 0

  await store
    .insert(holdings)
    .values(values)
    .onConflictDoUpdate({
      target: [holdings.accountId, holdings.securityId],
      set: {
        quantity: sqlExcluded("quantity"),
        costBasis: sqlExcluded("cost_basis"),
        institutionValue: sqlExcluded("institution_value"),
        updatedAt: sqlExcluded("updated_at"),
      },
    })

  return values.length
}

async function upsertSecurities(list: PlaidSecurity[], store: SyncDb) {
  if (list.length === 0) return

  await store
    .insert(securities)
    .values(
      list.map((s) => ({
        id: s.security_id,
        tickerSymbol: s.ticker_symbol ?? null,
        name: s.name ?? null,
        type: s.type ?? null,
        closePrice: s.close_price?.toString() ?? null,
        closePriceAsOf: s.close_price_as_of ?? null,
        isoCurrencyCode: s.iso_currency_code ?? "USD",
        updatedAt: new Date(),
      })),
    )
    .onConflictDoUpdate({
      target: securities.id,
      set: {
        tickerSymbol: sqlExcluded("ticker_symbol"),
        name: sqlExcluded("name"),
        type: sqlExcluded("type"),
        // Keep a price we already have when Plaid sends none (cash sweeps, some funds).
        closePrice: sql`coalesce(excluded.close_price, ${securities.closePrice})`,
        closePriceAsOf: sql`coalesce(excluded.close_price_as_of, ${securities.closePriceAsOf})`,
        updatedAt: sqlExcluded("updated_at"),
      },
    })
}

/** `excluded.<column>` reference for use inside onConflictDoUpdate. */
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`)
}

/* ------------------------------------------------------------------ *
 * Snapshots
 * ------------------------------------------------------------------ */

const today = () => new Date().toISOString().slice(0, 10)

/**
 * Writes (or overwrites) today's snapshot for a user from current balances.
 *
 * Re-running the same day is safe and idempotent — it updates the existing row
 * rather than adding a second point to the series.
 */
/**
 * Investable balance right now, across every active account.
 *
 * Bracket any structural change with this — link an item, add, edit or delete
 * an account — and the difference is an external flow by definition, because
 * no market movement happens in between. That keeps the arithmetic in one
 * place instead of asking eight call sites to get it right.
 */
export async function investableTotal(userId: string, store: SyncDb = db): Promise<number> {
  const rows = await store
    .select({ category: accounts.category, balance: accounts.currentBalance })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))

  return rows
    .filter((r) => INVESTABLE.includes(r.category as AccountCategory))
    .reduce((sum, r) => sum + accountBalance(num(r.balance), r.category), 0)
}

/**
 * Writes today's snapshot.
 *
 * `externalFlow` is money that entered or left the portfolio without being
 * performance — a deposit, or a newly linked account's balance appearing.
 * Getting this wrong is not cosmetic: it lands directly in league standings
 * and Board rank, so linking a 401(k) would otherwise read as a 100% gain.
 */
export async function writeDailySnapshot(userId: string, externalFlow = 0, when: string = today(), store: SyncDb = db) {
  const rows = await store
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))

  let totalAssets = 0
  let totalLiabilities = 0
  let investableAssets = 0

  // A day counts as verified only if every contributing account is Plaid-backed.
  let sawManual = false

  for (const account of rows) {
    const category = account.category as AccountCategory
    const balance = accountBalance(num(account.currentBalance), category)
    if (account.source === "manual") sawManual = true

    if (LIABILITY.includes(category)) {
      totalLiabilities += balance
    } else {
      totalAssets += balance
      if (INVESTABLE.includes(category)) investableAssets += balance
    }
  }

  const items = await store.select({ id: plaidItems.id, status: plaidItems.status, lastSyncedAt: plaidItems.lastSyncedAt }).from(plaidItems).where(eq(plaidItems.userId, userId))
  const itemById = new Map(items.map((item) => [item.id, item]))
  // A successful refresh of one institution must not verify another institution's
  // stale/error balances. Public return eligibility also checks current Item state.
  const allFresh = rows.every((account) => {
    if (account.source === "manual") return false
    const item = account.itemId ? itemById.get(account.itemId) : undefined
    return item?.status === "active" && item.lastSyncedAt?.toISOString().slice(0, 10) === when
  })
  const isVerified = rows.length > 0 && !sawManual && allFresh
  const totals = { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, investableAssets, isVerified }

  // The first day's row is the entry value, the baseline for every return. A
  // pure market write must not overwrite it with the close (see keepsEntryValue).
  const [first] = await store.select({ date: min(portfolioSnapshots.date) }).from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId))
  if (keepsEntryValue(first?.date ?? null, when, externalFlow)) return totals

  await store
    .insert(portfolioSnapshots)
    .values({
      userId,
      date: when,
      totalAssets: totalAssets.toFixed(4),
      totalLiabilities: totalLiabilities.toFixed(4),
      netWorth: (totalAssets - totalLiabilities).toFixed(4),
      investableAssets: investableAssets.toFixed(4),
      netFlows: externalFlow.toFixed(4),
      isVerified,
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.userId, portfolioSnapshots.date],
      set: {
        totalAssets: sqlExcluded("total_assets"),
        totalLiabilities: sqlExcluded("total_liabilities"),
        netWorth: sqlExcluded("net_worth"),
        investableAssets: sqlExcluded("investable_assets"),
        netFlows: sql`${portfolioSnapshots.netFlows} + excluded.net_flows`,
        isVerified: sqlExcluded("is_verified"),
      },
    })

  return totals
}

/** Full refresh for one user: every active item, then today's snapshot. */
export async function syncUser(userId: string) {
  const deadline = Date.now() + 90_000
  // While paused nothing reaches Plaid; the last synced numbers stay as they are.
  const paused = await plaidPaused()
  const items = paused ? [] : await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))

  const results: SyncResult[] = []
  for (const item of items) {
    if (item.status === "disconnected") continue
    if (Date.now() >= deadline) {
      results.push({ itemId: item.id, accounts: 0, holdings: 0, status: "error", errorCode: "SYNC_DEADLINE_EXCEEDED" })
      continue
    }
    results.push(await syncItem(item.id, deadline))
  }

  // Each successful Item atomically records its balances, deduplicated flows and snapshot.
  // A failed Item leaves its old balances intact; report a partial refresh to callers.
  const totals = results.every((r) => r.status === "active") ? await db.transaction(async (store) => {
    await store.execute(sql`set local lock_timeout = '10s'`)
    await store.execute(sql`select pg_advisory_xact_lock(hashtext(${userId}))`)
    return writeDailySnapshot(userId, 0, today(), store)
  }) : null

  return { results, totals, paused }
}

/**
 * Users who get a snapshot from the nightly job: anyone with an item worth
 * syncing, plus anyone with a manual account — positions reprice overnight,
 * and a typed-in balance still needs its day on the record.
 */
export async function listSyncableUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: plaidItems.userId })
    .from(plaidItems)
    .where(inArray(plaidItems.status, ["active", "error"]))
    .union(
      db
        .selectDistinct({ userId: accounts.userId })
        .from(accounts)
        .where(and(eq(accounts.source, "manual"), eq(accounts.isActive, true))),
    )

  return rows.map((r) => r.userId)
}
