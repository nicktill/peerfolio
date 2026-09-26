import { and, desc, eq, gte, inArray, sql } from "drizzle-orm"
import type { AccountBase, Holding as PlaidHolding, Security as PlaidSecurity } from "plaid"
import { db, holdings, accounts, plaidItems, portfolioSnapshots, securities } from "@web/db"
import { decrypt } from "@web/lib/crypto"
import { getPlaidClient, isReauthRequired, plaidErrorCode } from "@web/lib/plaid"
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
export async function syncItem(itemRowId: string): Promise<SyncResult> {
  const item = await db.query.plaidItems.findFirst({ where: eq(plaidItems.id, itemRowId) })
  if (!item) throw new Error("Item not found")

  const client = getPlaidClient()
  const accessToken = decrypt(item.accessToken)

  try {
    const { data } = await client.accountsGet({ access_token: accessToken })
    const accountCount = await upsertPlaidAccounts(item.id, item.userId, data.accounts)

    // Holdings only exist for investment accounts; skip the call otherwise.
    const hasInvestments = data.accounts.some(
      (a) => categorizeAccount(a.type, a.subtype) === "investment",
    )

    let holdingCount = 0
    if (hasInvestments) {
      holdingCount = await syncHoldings(item.userId, accessToken)
    }

    await db
      .update(plaidItems)
      .set({ status: "active", errorCode: null, lastSyncedAt: new Date() })
      .where(eq(plaidItems.id, item.id))

    return { itemId: item.id, accounts: accountCount, holdings: holdingCount, status: "active" }
  } catch (error) {
    const code = plaidErrorCode(error)
    const status = isReauthRequired(code) ? "needs_reauth" : "error"

    await db
      .update(plaidItems)
      .set({ status, errorCode: code, lastSyncedAt: new Date() })
      .where(eq(plaidItems.id, item.id))

    return { itemId: item.id, accounts: 0, holdings: 0, status, errorCode: code ?? undefined }
  }
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

async function syncHoldings(userId: string, accessToken: string): Promise<number> {
  const client = getPlaidClient()
  const { data } = await client.investmentsHoldingsGet({ access_token: accessToken })

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
export async function writeDailySnapshot(userId: string, netFlows = 0, when: string = today()) {
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

  await db
    .insert(portfolioSnapshots)
    .values({
      userId,
      date: when,
      totalAssets: totalAssets.toFixed(4),
      totalLiabilities: totalLiabilities.toFixed(4),
      netWorth: (totalAssets - totalLiabilities).toFixed(4),
      investableAssets: investableAssets.toFixed(4),
      netFlows: netFlows.toFixed(4),
      isVerified,
    })
    .onConflictDoUpdate({
      target: [portfolioSnapshots.userId, portfolioSnapshots.date],
      set: {
        totalAssets: sqlExcluded("total_assets"),
        totalLiabilities: sqlExcluded("total_liabilities"),
        netWorth: sqlExcluded("net_worth"),
        investableAssets: sqlExcluded("investable_assets"),
        netFlows: sqlExcluded("net_flows"),
        isVerified: sqlExcluded("is_verified"),
      },
    })

  return { totalAssets, totalLiabilities, netWorth: totalAssets - totalLiabilities, investableAssets, isVerified }
}

/**
 * External cash moving in or out of investment accounts since `since`.
 *
 * Plaid signs investment transaction amounts from the account's perspective:
 * positive debits cash (buying stock), negative credits it (a deposit). We flip
 * the sign so a deposit reads as a positive inflow.
 */
export async function fetchNetFlows(userId: string, since: string): Promise<number> {
  const items = await db
    .select()
    .from(plaidItems)
    .where(and(eq(plaidItems.userId, userId), eq(plaidItems.status, "active")))

  const client = getPlaidClient()
  const EXTERNAL = new Set(["deposit", "withdrawal", "contribution", "distribution", "rollover", "transfer"])
  let net = 0

  for (const item of items) {
    try {
      const { data } = await client.investmentsTransactionsGet({
        access_token: decrypt(item.accessToken),
        start_date: since,
        end_date: today(),
      })

      for (const tx of data.investment_transactions) {
        const subtype = String(tx.subtype ?? "").toLowerCase()
        const type = String(tx.type ?? "").toLowerCase()
        if (EXTERNAL.has(subtype) || type === "transfer") {
          net += -tx.amount
        }
      }
    } catch {
      // A single unreachable institution shouldn't void the whole day's flows.
      continue
    }
  }

  return net
}

/** Full refresh for one user: every active item, then today's snapshot. */
export async function syncUser(userId: string) {
  const items = await db.select().from(plaidItems).where(eq(plaidItems.userId, userId))

  const results: SyncResult[] = []
  for (const item of items) {
    if (item.status === "disconnected") continue
    results.push(await syncItem(item.id))
  }

  const lastSnapshot = await db.query.portfolioSnapshots.findFirst({
    where: eq(portfolioSnapshots.userId, userId),
    orderBy: desc(portfolioSnapshots.date),
  })

  // Only count flows since the previous snapshot so nothing is double-counted.
  const netFlows = lastSnapshot ? await fetchNetFlows(userId, lastSnapshot.date) : 0
  const totals = await writeDailySnapshot(userId, netFlows)

  return { results, totals }
}

/** Users with at least one item that is worth syncing, for the nightly job. */
export async function listSyncableUserIds(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: plaidItems.userId })
    .from(plaidItems)
    .where(inArray(plaidItems.status, ["active", "error"]))

  return rows.map((r) => r.userId)
}

export { gte }
