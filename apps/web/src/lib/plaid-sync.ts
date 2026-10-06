import { getTableColumns, and, desc, eq, inArray, min, sql } from "drizzle-orm"
import type { AccountBase, Holding as PlaidHolding, Security as PlaidSecurity } from "plaid"
import { db, holdings, accounts, plaidItems, portfolioSnapshots, securities, portfolioFlowEvents, portfolioFlowBaselines, withPortfolioWrite } from "@web/db"
import { externalAmount, investmentFlowPages } from "@web/lib/portfolio-flows"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, isReauthRequired, plaidErrorCode } from "@web/lib/plaid"
import { keepsEntryValue } from "@web/lib/ranges"
import { categorizeAccount, type AccountCategory } from "@web/lib/account-category"

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
type Item = typeof plaidItems.$inferSelect
export type PreparedItem = { requestedAt: Date; item: Item; list?: AccountBase[]; positions?: { holdings: PlaidHolding[]; securities: PlaidSecurity[] }; error?: unknown }

/** Network work stays outside a database transaction/connection lease. */
export async function prepareItem(itemRowId: string, deadline = Infinity): Promise<PreparedItem> {
  const [item] = await db.select({ ...getTableColumns(plaidItems), requestedAt: sql<string>`clock_timestamp()::text` }).from(plaidItems).where(eq(plaidItems.id, itemRowId))
  if (!item) throw new Error("Item not found")
  try {
    const client = getPlaidClient()
    const access_token = decrypt(item.accessToken)
    const { data } = await client.accountsGet({ access_token })
    const investments = data.accounts.some(a => categorizeAccount(a.type, a.subtype) === "investment")
    if (Date.now() > deadline - 10_000) throw new Error("Sync deadline reached")
    const positions = investments ? (await client.investmentsHoldingsGet({ access_token })).data : undefined
    return { requestedAt: new Date(item.requestedAt), item, list: data.accounts, positions }
  } catch (error) { return { requestedAt: new Date(item.requestedAt), item, error } }
}

export async function applyPreparedItem(prepared: PreparedItem): Promise<SyncResult> {
  const { item, list, positions, error } = prepared
  // The caller holds the user lock. An Item removed while HTTP was in flight
  // must not be resurrected, even by a webhook or a delayed refresh.
  const current = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, item.id) })
  if (!current) throw new Error("Connection was removed during refresh")
  if (current.lastSyncedAt && current.lastSyncedAt > prepared.requestedAt) {
    return { itemId: item.id, accounts: 0, holdings: 0, status: current.status === "active" ? "active" : "error", errorCode: current.errorCode ?? undefined }
  }
  if (!list) {
    const code = plaidErrorCode(error)
    const status = isReauthRequired(code) ? "needs_reauth" : "error"
    await db.update(plaidItems).set({ status, errorCode: code, lastSyncedAt: sql`clock_timestamp()` }).where(eq(plaidItems.id, item.id))
    return { itemId: item.id, accounts: 0, holdings: 0, status, errorCode: code ?? undefined }
  }
  const accountCount = await upsertPlaidAccounts(item.id, item.userId, list)
  const holdingCount = positions ? await syncHoldings(item.userId, positions) : 0
  await db.update(plaidItems).set({ status: "active", errorCode: null, lastSyncedAt: sql`clock_timestamp()` }).where(eq(plaidItems.id, item.id))
  return { itemId: item.id, accounts: accountCount, holdings: holdingCount, status: "active" }
}

export async function syncItem(itemRowId: string): Promise<SyncResult> {
  const prepared = await prepareItem(itemRowId)
  return withPortfolioWrite(prepared.item.userId, () => applyPreparedItem(prepared))
}

async function upsertPlaidAccounts(itemRowId: string, userId: string, list: AccountBase[]): Promise<number> {
  if (list.length === 0) return 0

  await db
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
        updatedAt: sqlExcluded("updated_at"),
      },
    })

  return list.length
}

async function syncHoldings(userId: string, data: { holdings: PlaidHolding[]; securities: PlaidSecurity[] }): Promise<number> {

  await upsertSecurities(data.securities)

  // Map Plaid account ids to our row ids so holdings can reference them.
  const plaidIds = [...new Set(data.holdings.map((h) => h.account_id))]
  if (plaidIds.length === 0) return 0

  const rows = await db
    .select({ id: accounts.id, plaidAccountId: accounts.plaidAccountId })
    .from(accounts)
    .where(inArray(accounts.plaidAccountId, plaidIds))

  const idByPlaidId = new Map(rows.map((r) => [r.plaidAccountId, r.id]))

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

  await db
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

async function upsertSecurities(list: PlaidSecurity[]) {
  if (list.length === 0) return

  await db
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
        closePrice: sqlExcluded("close_price"),
        closePriceAsOf: sqlExcluded("close_price_as_of"),
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
export async function investableTotal(userId: string): Promise<number> {
  const rows = await db
    .select({ category: accounts.category, balance: accounts.currentBalance })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))

  return rows
    .filter((r) => INVESTABLE.includes(r.category as AccountCategory))
    .reduce((sum, r) => sum + Math.abs(num(r.balance)), 0)
}

/**
 * Writes today's snapshot.
 *
 * `externalFlow` is money that entered or left the portfolio without being
 * performance — a deposit, or a newly linked account's balance appearing.
 * Getting this wrong is not cosmetic: it lands directly in league standings
 * and Board rank, so linking a 401(k) would otherwise read as a 100% gain.
 */
export async function writeDailySnapshot(userId: string, externalFlow = 0, when: string = today()) {
  return withPortfolioWrite(userId, () => writeDailySnapshotLocked(userId, externalFlow, when))
}

async function writeDailySnapshotLocked(userId: string, externalFlow: number, when: string) {
  const rows = await db
    .select()
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.isActive, true)))

  let totalAssets = 0
  let totalLiabilities = 0
  let investableAssets = 0

  // A day counts as verified only if every contributing account is Plaid-backed.
  let sawManual = false

  for (const account of rows) {
    const balance = Math.abs(num(account.currentBalance))
    const category = account.category as AccountCategory
    if (account.source === "manual") sawManual = true

    if (LIABILITY.includes(category)) {
      totalLiabilities += balance
    } else {
      totalAssets += balance
      if (INVESTABLE.includes(category)) investableAssets += balance
    }
  }

  const isVerified = rows.length > 0 && !sawManual
  const totals = { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, investableAssets, isVerified }

  // The first day's row is the entry value, the baseline for every return. A
  // pure market write must not overwrite it with the close (see keepsEntryValue).
  const [first] = await db.select({ date: min(portfolioSnapshots.date) }).from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId))
  if (keepsEntryValue(first?.date ?? null, when, externalFlow)) return totals

  await db
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

/**
 * External cash moving in or out of investment accounts since `since`.
 *
 * Plaid signs investment transaction amounts from the account's perspective:
 * positive debits cash (buying stock), negative credits it (a deposit). We flip
 * the sign so a deposit reads as a positive inflow.
 */
type PreparedFlows = { itemId: string; events: { id: string; date: string; amount: number }[]; failed: boolean }
async function prepareFlows(item: Item, baseline: string, investments: boolean, deadline = Infinity): Promise<PreparedFlows> {
  if (!investments) return { itemId: item.id, events: [], failed: false }
  try {
    const checked = item.flowCheckedThrough ?? baseline
    const lookback = new Date(`${checked}T00:00:00Z`).getTime() - 7 * 86_400_000
    const since = [baseline, new Date(lookback).toISOString().slice(0, 10)].sort().at(-1)!
    const list = await investmentFlowPages(async offset => {
      if (Date.now() > deadline - 10_000) throw new Error("Sync deadline reached")
      const { data } = await getPlaidClient().investmentsTransactionsGet({
        access_token: decrypt(item.accessToken), start_date: since, end_date: today(), options: { count: 500, offset },
      })
      return data
    })
    return { itemId: item.id, failed: false, events: list.flatMap(tx => {
      const amount = externalAmount(tx)
      return amount === null ? [] : [{ id: `${item.id}:${tx.investment_transaction_id}`, date: tx.date, amount }]
    }) }
  } catch { return { itemId: item.id, events: [], failed: true } }
}

/** Provider calls happen before the atomic write. Retried DB transactions reuse
 * the payload, so an overlapping run never repeats provider calls or flows. */
export async function syncUser(userId: string, requestedItemId?: string, deadline = Infinity) {
  const items = await db.select().from(plaidItems).where(and(eq(plaidItems.userId, userId), requestedItemId ? eq(plaidItems.id, requestedItemId) : undefined))
  const first = await db.query.portfolioSnapshots.findFirst({ where: eq(portfolioSnapshots.userId, userId), orderBy: desc(portfolioSnapshots.date) })
  const existingBaseline = await db.query.portfolioFlowBaselines.findFirst({ where: eq(portfolioFlowBaselines.userId, userId) })
  const baselineDate = existingBaseline?.date ?? first?.date ?? today()
  const eligible = items.filter(item => (item.status !== "disconnected" || requestedItemId)
    && !(Number.isFinite(deadline) && item.status === "active" && item.flowCheckedThrough === today() && item.lastSyncedAt?.toISOString().slice(0,10) === today()))
  const prepared: { item: PreparedItem; flows: PreparedFlows }[] = []
  for (const item of eligible) {
    if (Date.now() > deadline - 30_000) break
    const value = await prepareItem(item.id, deadline)
    const investments = !!value.list?.some(a => categorizeAccount(a.type, a.subtype) === "investment")
    prepared.push({ item: value, flows: value.list ? await prepareFlows(item, baselineDate, investments, deadline) : { itemId: item.id, events: [], failed: true } })
  }
  return withPortfolioWrite(userId, async () => {
    await db.insert(portfolioFlowBaselines).values({ userId, date: baselineDate }).onConflictDoNothing()
    const baseline = await db.query.portfolioFlowBaselines.findFirst({ where: eq(portfolioFlowBaselines.userId, userId) })
    const results: SyncResult[] = []
    const flowFailures: string[] = []
    let netFlows = 0
    for (const payload of prepared) {
      const current = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, payload.item.item.id) })
      if (!current) continue
      const before = current.flowsNeedBaseline ? await itemInvestable(current.id) : 0
      const result = await applyPreparedItem(payload.item)
      results.push(result)
      if (current.flowsNeedBaseline && result.status === "active") netFlows += await itemInvestable(current.id) - before
      if (current.flowsNeedBaseline && result.status === "active") await db.update(plaidItems).set({ flowsNeedBaseline: false }).where(eq(plaidItems.id, current.id))
      if (payload.flows.failed) { flowFailures.push(current.id); continue }
      for (const event of payload.flows.events) {
        if (event.date <= baseline!.date || (current.flowBaselineDate && event.date <= current.flowBaselineDate)) continue
        const inserted = await db.insert(portfolioFlowEvents).values({
          id: event.id, userId, amount: event.amount.toFixed(4), transactionDate: event.date, appliedDate: today(),
        }).onConflictDoNothing().returning({ amount: portfolioFlowEvents.amount })
        netFlows += Number(inserted[0]?.amount ?? 0)
      }
      await db.update(plaidItems).set({ flowCheckedThrough: today(), flowsNeedBaseline: false }).where(eq(plaidItems.id, current.id))
    }
    const totals = await writeDailySnapshot(userId, netFlows)
    return { results, totals, flowFailures, deferred: prepared.length < eligible.length, healthy: prepared.length === eligible.length && flowFailures.length === 0 && results.every(r => r.status === "active") }
  })
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

async function itemInvestable(itemId: string) {
  const rows = await db.select({ balance: accounts.currentBalance }).from(accounts)
    .where(and(eq(accounts.itemId, itemId), eq(accounts.category, "investment"), eq(accounts.isActive, true)))
  return rows.reduce((sum, a) => sum + Math.abs(Number(a.balance ?? 0)), 0)
}
