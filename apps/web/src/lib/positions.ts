import { and, eq, isNotNull, sql } from "drizzle-orm"
import { accounts, db, holdings, securities } from "@web/db"
import { ApiError } from "@web/lib/api"
import {
  displaySymbol,
  latestCloses,
  MarketDataError,
  previousClose,
  searchTickers,
  tickerDetails,
  toMarketTicker,
  type AssetKind,
} from "@web/lib/market-data"

/**
 * Positions in manual accounts, priced from market data.
 *
 * They live in the same `holdings` and `securities` tables Plaid fills, so the
 * dashboard, allocation and shared tickers read both the same way. A manual
 * account with positions is worth the sum of them; its typed balance is only
 * used while it has none.
 *
 * Callers bracket every change with `investableTotal` so adding or removing a
 * position is booked as a cash flow, never as performance.
 */

/** Only manual accounts are editable — Plaid balances come from the institution. */
export async function requireManualAccount(userId: string, id: string) {
  const account = await db.query.accounts.findFirst({
    where: and(eq(accounts.id, id), eq(accounts.userId, userId)),
  })
  if (!account) throw new ApiError("Account not found", 404)
  if (account.source !== "manual") throw new ApiError("Connected accounts are updated from your institution", 409)
  return account
}

/**
 * Makes sure a `mkt:` security row exists with a close price, fetching one only
 * when there is none yet or (with `maxAgeHours`) the stored one is stale.
 * Reusing the nightly close means everyone holding a ticker is valued
 * identically, and saves a call per lookup.
 */
export async function ensurePriced(marketTicker: string, kind: AssetKind, { maxAgeHours }: { maxAgeHours?: number } = {}) {
  const securityId = `mkt:${marketTicker}`
  const existing = await db.query.securities.findFirst({ where: eq(securities.id, securityId) })
  const fresh =
    existing?.closePrice && existing.closePriceAsOf &&
    (maxAgeHours === undefined || Date.now() - existing.updatedAt.getTime() < maxAgeHours * 3_600_000)
  if (fresh) return { securityId, price: Number(existing.closePrice), asOf: existing.closePriceAsOf!, name: existing.name }

  const close = await previousClose(marketTicker).catch((error: unknown) => {
    if (!(error instanceof MarketDataError)) throw error
    // An unknown ticker is "not found", not an outage.
    if (error.status === 404) return null
    console.error("[positions] price lookup failed:", error.message)
    throw error.status === 429
      ? new ApiError("Too many price lookups right now. Try again in a minute.", 429)
      : new ApiError("Prices are unavailable right now", 503)
  })
  if (!close) {
    // A stale price beats none when the provider has nothing newer.
    if (existing?.closePrice && existing.closePriceAsOf) {
      return { securityId, price: Number(existing.closePrice), asOf: existing.closePriceAsOf, name: existing.name }
    }
    throw await notFound(displaySymbol(marketTicker), kind)
  }

  await db
    .insert(securities)
    .values({
      id: securityId,
      tickerSymbol: displaySymbol(marketTicker),
      type: kind === "crypto" ? "cryptocurrency" : "equity",
      marketTicker,
      closePrice: close.price.toString(),
      closePriceAsOf: close.asOf,
    })
    .onConflictDoUpdate({
      target: securities.id,
      set: { closePrice: close.price.toString(), closePriceAsOf: close.asOf, updatedAt: new Date() },
    })

  return { securityId, price: close.price, asOf: close.asOf, name: existing?.name ?? null }
}

/** A 404 naming the ticker, with close matches when the provider has any. */
async function notFound(symbol: string, kind: AssetKind) {
  const suggestions = await searchTickers(symbol, kind).catch(() => [])
  const hint = suggestions[0] ? ` Did you mean ${suggestions[0].symbol}?` : ""
  return new ApiError(`We couldn't find ${symbol}.${hint}`, 404, { suggestions })
}

/**
 * Resolves what someone typed to a priced, named security, for the add form's
 * preview. The company name is fetched once and kept on the security row.
 */
export async function lookupTicker(symbol: string, kind: AssetKind) {
  const marketTicker = toMarketTicker(symbol, kind)
  if (!marketTicker) throw await notFound(symbol.trim().toUpperCase(), kind)

  const priced = await ensurePriced(marketTicker, kind)
  let name = priced.name
  if (!name) {
    const details = await tickerDetails(marketTicker).catch(() => null)
    name = details?.name ?? null
    if (name) await db.update(securities).set({ name }).where(eq(securities.id, priced.securityId))
  }
  return { symbol: displaySymbol(marketTicker), kind, name, price: priced.price, asOf: priced.asOf }
}

/** Adds a position, or replaces the quantity if the account already holds it. */
export async function setPosition(
  accountId: string,
  userId: string,
  input: { symbol: string; kind: AssetKind; quantity: number; avgCost?: number | null },
) {
  const marketTicker = toMarketTicker(input.symbol, input.kind)
  if (!marketTicker) throw new ApiError(`${input.symbol} doesn't look like a ${input.kind === "crypto" ? "coin" : "ticker"}`)

  const { securityId } = await ensurePriced(marketTicker, input.kind)

  // An average cost sets the basis; leaving it out keeps the existing average
  // per share, so changing the share count doesn't invent a gain.
  const existing = await db.query.holdings.findFirst({
    where: and(eq(holdings.accountId, accountId), eq(holdings.securityId, securityId)),
  })
  let costBasis: string | null
  if (input.avgCost !== undefined) {
    costBasis = input.avgCost === null ? null : (input.avgCost * input.quantity).toFixed(4)
  } else if (existing?.costBasis && existing.quantity && Number(existing.quantity) > 0) {
    costBasis = ((Number(existing.costBasis) / Number(existing.quantity)) * input.quantity).toFixed(4)
  } else {
    costBasis = null
  }

  await db
    .insert(holdings)
    .values({ accountId, userId, securityId, quantity: input.quantity.toString(), costBasis })
    .onConflictDoUpdate({
      target: [holdings.accountId, holdings.securityId],
      set: { quantity: input.quantity.toString(), costBasis, updatedAt: new Date() },
    })

  await revalue(accountId)
}

export async function removePosition(accountId: string, holdingId: string) {
  const deleted = await db
    .delete(holdings)
    .where(and(eq(holdings.id, holdingId), eq(holdings.accountId, accountId)))
    .returning({ id: holdings.id })
  if (deleted.length === 0) throw new ApiError("Position not found", 404)

  await revalue(accountId)
}

export async function accountHasPositions(accountId: string): Promise<boolean> {
  const row = await db.query.holdings.findFirst({ where: eq(holdings.accountId, accountId), columns: { id: true } })
  return !!row
}

/**
 * Nightly: fetch the latest close for every held ticker, then revalue every
 * manual account that has positions. Runs before snapshots are written, so the
 * move shows up as return rather than as a flow.
 */
export async function repricePositions() {
  // Every ticker someone holds, in a real manual account or a fantasy league.
  const held = await db
    .select({ id: securities.id, marketTicker: securities.marketTicker })
    .from(securities)
    .where(
      and(
        isNotNull(securities.marketTicker),
        sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
          OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id}))`,
      ),
    )

  const closes = await latestCloses(held.map((s) => s.marketTicker!))

  for (const security of held) {
    const close = closes.get(security.marketTicker!)
    if (!close) continue
    await db
      .update(securities)
      .set({ closePrice: close.price.toString(), closePriceAsOf: close.asOf, updatedAt: new Date() })
      .where(eq(securities.id, security.id))
  }

  await revalue()
  return { tickers: held.length, priced: closes.size }
}

let lastRefreshAttempt = 0

/**
 * Brings stored closes up to date when someone opens a page, so a balance never
 * waits a full day on the nightly job. Costs at most one grouped request per
 * market (not per ticker), only for tickers not checked within `maxAgeHours`,
 * and is throttled per server instance so page loads can't spend the provider's
 * free rate limit. Never throws: a stale price beats a broken page.
 */
export async function refreshStalePrices({ maxAgeHours = 6, minIntervalMinutes = 10 } = {}) {
  const now = Date.now()
  if (now - lastRefreshAttempt < minIntervalMinutes * 60_000) return { refreshed: 0 }
  lastRefreshAttempt = now

  try {
    const cutoff = new Date(now - maxAgeHours * 3_600_000)
    const stale = await db
      .select({ id: securities.id, marketTicker: securities.marketTicker })
      .from(securities)
      .where(
        and(
          isNotNull(securities.marketTicker),
          sql`${securities.updatedAt} < ${cutoff}`,
          sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
            OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id}))`,
        ),
      )
    if (stale.length === 0) return { refreshed: 0 }

    const closes = await latestCloses(stale.map((s) => s.marketTicker!))
    let refreshed = 0
    for (const security of stale) {
      const close = closes.get(security.marketTicker!)
      // No newer close (weekend, holiday) still counts as checked.
      await db
        .update(securities)
        .set(close ? { closePrice: close.price.toString(), closePriceAsOf: close.asOf, updatedAt: new Date() } : { updatedAt: new Date() })
        .where(eq(securities.id, security.id))
      if (close) refreshed++
    }
    if (refreshed > 0) await revalue()
    return { refreshed }
  } catch (error) {
    console.error("[positions] price refresh failed:", error instanceof Error ? error.message : error)
    return { refreshed: 0 }
  }
}

/**
 * Recomputes holding values and manual account balances from stored closes.
 * With an account id, only that account — including one whose last position
 * was just removed, which drops to zero.
 */
async function revalue(accountId?: string) {
  const onlyAccount = accountId ? sql`AND h.account_id = ${accountId}` : sql``

  await db.execute(sql`
    UPDATE holdings h
    SET institution_value = h.quantity * s.close_price, updated_at = now()
    FROM securities s
    WHERE s.id = h.security_id AND s.market_ticker IS NOT NULL ${onlyAccount}
  `)

  await db.execute(sql`
    UPDATE accounts a
    SET current_balance = COALESCE((SELECT sum(institution_value) FROM holdings WHERE account_id = a.id), 0),
        updated_at = now()
    WHERE a.source = 'manual'
      AND ${accountId ? sql`a.id = ${accountId}` : sql`EXISTS (SELECT 1 FROM holdings WHERE account_id = a.id)`}
  `)
}
