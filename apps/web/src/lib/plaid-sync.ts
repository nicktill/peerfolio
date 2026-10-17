import { decodePlaidToken } from "@web/lib/plaid-profile"
import { and, eq, inArray, isNull, min, ne, sql } from "drizzle-orm"
import type { AccountBase, Holding as PlaidHolding, Security as PlaidSecurity } from "plaid"
import { db, holdings, accounts, plaidItems, portfolioSnapshots, securities, plaidInvestmentFlows } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, isReauthRequired, plaidErrorCode } from "@web/lib/plaid"
import { accountsAwaitingHoldings, countByReason, flowChanges, investmentHistoryStart, investmentPages, marketTarget, mergeDuplicateHoldings, positionlessPlanAccounts, positionlessPlansWithLines, retryPlaid, securityDisplayName, splitUsableHoldings } from "@web/lib/plaid-sync-core"
import { keepsEntryValue } from "@web/lib/ranges"
import { categorizeAccount, type AccountCategory } from "@web/lib/account-category"
import { accountBalance } from "@web/lib/account-balance"
import { latestStartedSession } from "@web/lib/market-hours"
import { revalue } from "@web/lib/positions"
import { assertPlaidActive, plaidPaused } from "@web/lib/plaid-switch"
import { buildSyncRun, countMissingTicker, emptyMetrics, plaidRequestId, type SyncTrigger } from "@web/lib/plaid-sync-runs-core"
import { recordSyncRun } from "@web/lib/plaid-sync-runs"

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
  /** Investment accounts with a balance but no positions yet; a later sync (webhook or nightly) fills them in. */
  holdingsPending?: number
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

export async function syncItem(itemRowId: string, deadline = Date.now() + 90_000, trigger: SyncTrigger = "manual"): Promise<SyncResult> {
  await assertPlaidActive()
  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, itemRowId) })
  if (!item) throw new Error("Item not found")
  const startedAt = new Date()
  const metrics = emptyMetrics()
  try {
    const result: SyncResult = await db.transaction(async (store) => {
      // All paths (cron, webhook, refresh, relink) serialize for this user's returns.
      await store.execute(sql`set local lock_timeout = '10s'`)
      await store.execute(sql`select pg_advisory_xact_lock(hashtext(${item.userId}))`)
      const current = await store.query.plaidItems.findFirst({ where: eq(plaidItems.id, item.id) })
      if (!current) throw new Error("Item not found")
      if (current.status === "disconnected") throw new Error("Item disconnected")
      const stored = decodePlaidToken(decrypt(current.accessToken))
      const client = getPlaidClient(stored.profile)
      const accessToken = stored.token
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
      metrics.accounts = data.accounts.length
      const fetchHoldings = async () => {
        const response = await retryPlaid(() => client.investmentsHoldingsGet({ access_token: accessToken }), undefined, deadline)
        metrics.requestId = plaidRequestId(response) ?? metrics.requestId
        return response.data
      }
      let holdingData = hasInvestments ? await fetchHoldings() : null
      // A new Item's positions can still be loading: Plaid answers 200 with no lines for accounts that do have a balance.
      // Ask again a couple of times before settling for that.
      const awaitingNow = (d: NonNullable<typeof holdingData>) => accountsAwaitingHoldings(
        d.accounts.map((a) => ({ account_id: a.account_id, balance: a.balances.current, subtype: a.subtype })),
        rawLineCounts(d.holdings),
      )
      let holdingAttempts = 1
      for (const waitMs of syncTuning.emptyHoldingsWaits) {
        if (!holdingData || awaitingNow(holdingData).length === 0 || Date.now() + waitMs + 5_000 >= deadline) break
        await new Promise<void>((resolve) => setTimeout(resolve, waitMs))
        holdingData = await fetchHoldings()
        holdingAttempts++
      }
      const awaiting = new Set(holdingData ? awaitingNow(holdingData) : [])
      const positionAccounts = holdingData ? holdingData.accounts.map((a) => ({ account_id: a.account_id, balance: a.balances.current, subtype: a.subtype })) : []
      const lineCounts = holdingData ? rawLineCounts(holdingData.holdings) : new Map<string, number>()
      const positionless = positionlessPlanAccounts(positionAccounts, lineCounts)
      const unexpectedLines = positionlessPlansWithLines(positionAccounts, lineCounts)
      if (unexpectedLines.length) console.warn(`[plaid-sync] positionless plan type returned positions, review the pension exemption ${JSON.stringify({ item: item.id, accounts: unexpectedLines.length })}`)
      const holdingsReceived = holdingData?.holdings.length ?? 0
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
        const { kept, skipped, assumedCurrency } = splitUsableHoldings(holdingData.holdings, new Map(importedAccounts.filter((a) => categorizeAccount(a.type, a.subtype) === "investment").map((a) => [a.account_id, a.balances.iso_currency_code])))
        // Stocks, ETFs and funds with a market ticker are tracked under our shared price rows, so
        // they are priced like manual positions; two Plaid securities for one ticker merge here.
        const targets = new Map(holdingData.securities.flatMap((s) => { const t = marketTarget(s); return t ? [[s.security_id, t.id] as const] : [] }))
        holdingData.holdings = mergeDuplicateHoldings(kept.map((h) => (targets.has(h.security_id) ? { ...h, security_id: targets.get(h.security_id)! } : h)))
        Object.assign(metrics, { holdingsReceived, holdingsKept: kept.length, skipped: countByReason(skipped), currencyAssumed: assumedCurrency, securitiesMissingTicker: countMissingTicker(holdingData.securities), balanceWithoutHoldings: awaiting.size > 0, positionlessAccounts: positionless.length })
        // One structured line per sync, so an empty Holdings view can be explained from the logs alone.
        const summary = JSON.stringify({
          item: item.id, accounts: holdingData.accounts.length, received: holdingsReceived, securities: holdingData.securities.length,
          skipped: countByReason(skipped), currencyAssumed: assumedCurrency, missingTicker: metrics.securitiesMissingTicker, kept: kept.length, saved: holdingData.holdings.length, awaitingAccounts: awaiting.size, positionless: positionless.length, attempts: holdingAttempts,
        })
        if (awaiting.size) console.warn(`[plaid-sync] holdings still loading ${summary}`)
        else console.info(`[plaid-sync] holdings ${summary}`)
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
      if (holdingData) holdingCount = await syncHoldings(item.id, item.userId, holdingData, store, awaiting)
      // The sync wrote the institution's values; bring them to our prices before anything is recorded
      // (the snapshot below), so the page, the snapshot and today's change all agree.
      if (holdingData) for (const account of await store.select({ id: accounts.id }).from(accounts).where(and(eq(accounts.itemId, item.id), eq(accounts.userId, item.userId), eq(accounts.isActive, true)))) await revalue(account.id, undefined, store)
      if (changes.entries.length) await store.insert(plaidInvestmentFlows).values(changes.entries.map((r) => ({
        transactionId: r.transactionId, itemId: item.id, accountId: r.accountId, amount: r.amount.toFixed(4), baseline: r.baseline, transactionDate: r.date,
      }))).onConflictDoUpdate({ target: plaidInvestmentFlows.transactionId, set: { amount: sqlExcluded("amount"), transactionDate: sqlExcluded("transaction_date") } })
      await store.update(plaidItems).set({ status: "active", errorCode: null, lastSyncedAt: new Date(), flowsInitialized: true }).where(eq(plaidItems.id, item.id))
      await writeDailySnapshot(item.userId, structuralFlow + changes.net, today(), store)
      return { itemId: item.id, accounts: accountCount, holdings: holdingCount, holdingsPending: awaiting.size, status: "active" }
    })
    await recordSyncRun(buildSyncRun({ itemId: item.id, userId: item.userId, trigger, startedAt, finishedAt: new Date(), failed: false, metrics }))
    return result
  } catch (error) {
    const code = error instanceof SyncValidationError ? error.code : plaidErrorCode(error)
    metrics.requestId = plaidRequestId(error) ?? metrics.requestId
    await recordSyncRun(buildSyncRun({ itemId: item.id, userId: item.userId, trigger, startedAt, finishedAt: new Date(), failed: true, errorCode: code, metrics }))
    const status = isReauthRequired(code) ? "needs_reauth" : "error"
    // This timestamp means the last successful import, never the last attempt.
    await db.update(plaidItems).set({ status, errorCode: code ?? "SYNC_FAILED" }).where(and(eq(plaidItems.id, item.id), ne(plaidItems.status, "disconnected"), item.lastSyncedAt ? eq(plaidItems.lastSyncedAt, item.lastSyncedAt) : isNull(plaidItems.lastSyncedAt)))
    return { itemId: item.id, accounts: 0, holdings: 0, status, errorCode: code ?? undefined }
  }
}

/** Pauses between re-asking for positions that are still loading; tests shorten them. */
export const syncTuning = { emptyHoldingsWaits: [3000, 6000] }
const rawLineCounts = (lines: { account_id: string }[]) => lines.reduce((counts, l) => counts.set(l.account_id, (counts.get(l.account_id) ?? 0) + 1), new Map<string, number>())

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

async function syncHoldings(itemRowId: string, userId: string, data: { accounts: { account_id: string }[]; holdings: PlaidHolding[]; securities: PlaidSecurity[] }, store: SyncDb, awaiting: Set<string> = new Set()): Promise<number> {
  await upsertSecurities(data.securities, store, data.holdings)
  // Scope to accounts in this response, including those with ZERO positions.
  const rows = await store.select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId }).from(accounts)
    .where(and(eq(accounts.itemId, itemRowId), eq(accounts.userId, userId), inArray(accounts.plaidAccountId, data.accounts.map((a) => a.account_id))))
  const idByPlaidId = new Map(rows.map((r) => [r.plaidAccountId, r.id]))
  if (data.holdings.some((h) => !idByPlaidId.has(h.account_id))) throw new Error("Holdings reference an unknown account")
  // Replace the authoritative holdings set atomically; failures roll back deletion.
  // An account that reports a balance but no lines yet keeps what it had; an early empty answer is not "everything was sold".
  const replaced = rows.filter((r) => !awaiting.has(r.plaidAccountId!))
  if (replaced.length) await store.delete(holdings).where(inArray(holdings.accountId, replaced.map((r) => r.id)))
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

async function upsertSecurities(list: PlaidSecurity[], store: SyncDb, lines: PlaidHolding[] = []) {
  if (list.length === 0) return
  // Funds without a close price (401(k) options, sweeps) still carry the institution's own price.
  const institutionPrice = new Map<string, { price: number; asOf: string | null }>()
  for (const l of lines) if (l.institution_price != null && Number.isFinite(l.institution_price) && !institutionPrice.has(l.security_id)) institutionPrice.set(l.security_id, { price: l.institution_price, asOf: l.institution_price_as_of ?? null })

  // Securities we price ourselves get (or keep) the shared row, seeded with Plaid's close only when new:
  // after that the row belongs to our price jobs and a sync never moves its price.
  const shared = new Map<string, typeof securities.$inferInsert>()
  for (const s of list) {
    const target = marketTarget(s)
    if (!target || shared.has(target.id)) continue
    const fallback = institutionPrice.get(s.security_id)
    shared.set(target.id, {
      id: target.id,
      tickerSymbol: target.marketTicker,
      name: securityDisplayName(s),
      type: target.type,
      marketTicker: target.marketTicker,
      ...seedPrice(s, fallback),
      isoCurrencyCode: s.iso_currency_code ?? "USD",
      updatedAt: new Date(),
    })
  }
  if (shared.size > 0) {
    await store
      .insert(securities)
      .values([...shared.values()])
      .onConflictDoUpdate({ target: securities.id, set: { name: sql`coalesce(securities.name, excluded.name)` } })
  }
  list = list.filter((s) => !marketTarget(s))
  if (list.length === 0) return

  await store
    .insert(securities)
    .values(
      list.map((s) => ({
        id: s.security_id,
        tickerSymbol: s.ticker_symbol ?? null,
        name: securityDisplayName(s),
        type: s.type ?? null,
        closePrice: (s.close_price ?? institutionPrice.get(s.security_id)?.price)?.toString() ?? null,
        closePriceAsOf: s.close_price != null ? s.close_price_as_of ?? null : institutionPrice.get(s.security_id)?.asOf ?? s.close_price_as_of ?? null,
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
        // Plaid securities have no market ticker, so nothing else prices them: the close
        // Plaid reports is the only history. When it moves to a newer date the old close
        // becomes `previous_close`, which is what "today" is measured against. A sync
        // carrying an older (or no) close never steps the stored price back.
        previousClose: sql`CASE WHEN excluded.close_price IS NOT NULL AND excluded.close_price_as_of > securities.close_price_as_of THEN securities.close_price ELSE securities.previous_close END`,
        closePrice: sql`CASE WHEN excluded.close_price IS NOT NULL AND (securities.close_price_as_of IS NULL OR excluded.close_price_as_of >= securities.close_price_as_of) THEN excluded.close_price ELSE securities.close_price END`,
        closePriceAsOf: sql`CASE WHEN excluded.close_price IS NOT NULL AND (securities.close_price_as_of IS NULL OR excluded.close_price_as_of >= securities.close_price_as_of) THEN excluded.close_price_as_of ELSE securities.close_price_as_of END`,
        updatedAt: sqlExcluded("updated_at"),
      },
    })
}

/**
 * The first price for a new shared row. The institution's own price is current, so it is used
 * (dated to the latest session) with Plaid's close, which is the previous session's, kept as
 * the close "today" is measured from. Without one, Plaid's close stands on its own. Our price
 * jobs take over from the next refresh.
 */
function seedPrice(s: PlaidSecurity, institution: { price: number; asOf: string | null } | undefined) {
  if (institution) {
    const session = latestStartedSession(new Date())
    const close = s.close_price != null && s.close_price_as_of && s.close_price_as_of < session ? s.close_price : null
    return { closePrice: institution.price.toString(), closePriceAsOf: session, previousClose: close?.toString() ?? null, closePriceFinal: true }
  }
  return { closePrice: s.close_price?.toString() ?? null, closePriceAsOf: s.close_price_as_of ?? null, closePriceFinal: true }
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
  if (keepsEntryValue(first?.date ?? null, when, externalFlow)) {
    // Preserve the entry value, but a stale contributing Item must revoke verification.
    await store.update(portfolioSnapshots).set({ isVerified: sql`${portfolioSnapshots.isVerified} AND ${isVerified}` }).where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.date, when)))
    return totals
  }

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
export async function syncUser(userId: string, trigger: SyncTrigger = "manual") {
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
    results.push(await syncItem(item.id, deadline, trigger))
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
