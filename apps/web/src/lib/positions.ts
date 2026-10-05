import { after } from "next/server"
import { and, eq, inArray, isNotNull, isNull, lt, sql } from "drizzle-orm"
import { accounts, db, holdings, securities } from "@web/db"
import { ApiError } from "@web/lib/api"
import { isUsMarketOpen, latestCompletedSession } from "@web/lib/market-hours"
import { previousCloseOnUpdate } from "@web/lib/price-write"
import { acceptSessionClose, createQuoteProvider, quoteDate } from "@web/lib/quote-provider"
import { createFinnhubProvider } from "@web/lib/finnhub"
import { isPlanIdentifier } from "@web/lib/import-parse"
import { tiingoApiKey, tiingoFundCloses } from "@web/lib/tiingo"
import { staleHeldSecurities } from "@web/lib/stale-prices"
import {
  displaySymbol,
  isNewerClose,
  latestCloses,
  MarketDataError,
  previousClose,
  searchTickers,
  tickerDetails,
  toMarketTicker,
  type AssetKind,
  type Close,
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

  // Never step a price backwards: keep the stored close when it is newer.
  if (existing?.closePrice && existing.closePriceAsOf && !isNewerClose(close.asOf, existing.closePriceAsOf)) {
    return { securityId, price: Number(existing.closePrice), asOf: existing.closePriceAsOf, name: existing.name }
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
      closePriceFinal: true,
    })
    .onConflictDoUpdate({
      target: securities.id,
      set: { previousClose: previousCloseOnUpdate(close.asOf), closePrice: close.price.toString(), closePriceAsOf: close.asOf, closePriceFinal: true, updatedAt: new Date() },
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
  const name = await enrichSecurityMetadata(priced.securityId, marketTicker).catch(() => null) ?? priced.name
  return { symbol: displaySymbol(marketTicker), kind, name, price: priced.price, asOf: priced.asOf }
}

/** Metadata writes never touch prices, basis, quantity or price freshness. */
async function enrichSecurityMetadata(securityId: string, marketTicker: string) {
  const current = await db.query.securities.findFirst({ where: eq(securities.id, securityId) })
  if (!current || current.type === "mutual_fund") return current?.name
  if (current.metadataCheckedAt && Date.now() - current.metadataCheckedAt.getTime() < 7 * 86_400_000) return current.name
  const details = await tickerDetails(marketTicker)
  await db.update(securities).set({
    metadataCheckedAt: new Date(),
    ...(details?.name && !current.name ? { name: details.name } : {}),
    ...(details?.securityType && current.type !== "cryptocurrency" ? { type: details.securityType } : {}),
  }).where(eq(securities.id, securityId))
  return details?.name ?? current.name
}

/** One reference request per cron run; never send provider requests for plan identifiers. */
/**
 * Reference lookups per run: one. The provider's free plan allows only a handful a
 * minute and a rate-limited ticker waits a day for its retry, so the backlog is worked
 * down by more runs (the schedule, and dashboard visits) rather than bigger ones.
 */
const METADATA_PER_RUN = 1

export async function refreshSecurityMetadata() {
  if (!process.env.MASSIVE_API_KEY) return { checked: 0, attempted: 0, reason: "missing_key" as const }
  const candidates = await db.select({ id: securities.id, marketTicker: securities.marketTicker }).from(securities)
    .where(and(
      isNotNull(securities.marketTicker),
      inArray(securities.type, ["equity", "etf"]),
      sql`(${securities.metadataCheckedAt} IS NULL OR ${securities.metadataCheckedAt} < now() - interval '7 days')`,
      sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
        OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id}))`,
    ))
    .orderBy(sql`${securities.metadataCheckedAt} ASC NULLS FIRST`, securities.id).limit(METADATA_PER_RUN)
  let checked = 0
  for (const security of candidates) {
    try {
      await enrichSecurityMetadata(security.id, security.marketTicker!)
      checked++
    } catch (error) {
      // Retry failures later without delaying prices or permanently starving other tickers.
      await db.update(securities).set({ metadataCheckedAt: new Date(Date.now() - 6 * 86_400_000) }).where(eq(securities.id, security.id))
      console.error("[positions] metadata refresh failed:", error instanceof Error ? error.message : "unknown")
      // A failure usually means a rate limit, so stop here and let the next run carry on.
      return {
        checked,
        attempted: checked + 1,
        symbol: security.marketTicker,
        status: error instanceof MarketDataError ? error.status ?? null : null,
        reason: "provider_error" as const,
      }
    }
  }
  return { checked, attempted: candidates.length, reason: candidates.length ? "updated" as const : "no_candidate" as const }
}

let lastMetadataKick = 0

/**
 * Also works through the backlog when someone opens the dashboard, so types get
 * corrected even when the scheduled job doesn't run. Throttled per server and
 * run after the response, so a page load never waits on it.
 */
export function scheduleMetadataRefresh(minIntervalSeconds = 120) {
  const now = Date.now()
  if (now - lastMetadataKick < minIntervalSeconds * 1000) return
  lastMetadataKick = now
  try {
    after(async () => {
      try {
        await refreshSecurityMetadata()
      } catch (error) {
        console.error("[positions] metadata refresh failed:", error instanceof Error ? error.message : "unknown")
      }
    })
  } catch {
    // Outside a request there's nothing to attach to; the next request will do it.
  }
}

type PositionInput = { symbol: string; kind: AssetKind; quantity: number; avgCost?: number | null }

/** The write behind `setPosition`, without revaluing, so a bulk import can revalue once at the end. */
async function upsertPosition(accountId: string, userId: string, input: PositionInput) {
  const marketTicker = toMarketTicker(input.symbol, input.kind)
  if (!marketTicker) throw new ApiError(`${input.symbol} doesn't look like a ${input.kind === "crypto" ? "coin" : "ticker"}`)

  const { securityId } = await ensurePriced(marketTicker, input.kind)
  await writeHolding(accountId, userId, securityId, input)
  return { securityId, marketTicker }
}

/** Saves the holding for a security that already exists, priced or not. */
async function writeHolding(accountId: string, userId: string, securityId: string, input: PositionInput) {
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
}

/** Adds a position, or replaces the quantity if the account already holds it. */
export async function setPosition(accountId: string, userId: string, input: PositionInput) {
  const symbol = input.symbol.trim().toUpperCase()
  if (input.kind === "stock" && isPlanIdentifier(symbol)) {
    const id = `file:${accountId}:${symbol}`
    const security = await db.query.securities.findFirst({ where: eq(securities.id, id) })
    if (!security?.closePrice) throw new ApiError("Import this plan holding with its price from your brokerage first", 404)
    await writeHolding(accountId, userId, id, input)
    await db.update(holdings).set({ institutionValue: (input.quantity * Number(security.closePrice)).toFixed(4) })
      .where(and(eq(holdings.accountId, accountId), eq(holdings.securityId, id)))
  } else {
    await upsertPosition(accountId, userId, input)
  }
  await revalue(accountId)
}

export type ImportRowInput = PositionInput & { name?: string | null; price?: number | null }
export type ImportResult = {
  imported: number
  removed: number
  /** Priced from the file itself because no market data source knows them (mutual funds). */
  fromFile: string[]
  /** Tickers we couldn't add, with why (for example not found). */
  failed: { symbol: string; reason: string }[]
  /** Added without a price yet (the provider was busy); they're priced within minutes and count once they are. */
  pending: string[]
}

/**
 * Prices every unseen ticker in one grouped request instead of one call each,
 * so a fifty-position import doesn't run into the provider's per-minute limit.
 * Tickers it doesn't return fall through to the per-ticker lookup (and its
 * clear "couldn't find" error) later. Never throws.
 */
async function primePrices(rows: { marketTicker: string; kind: AssetKind; name?: string | null }[]): Promise<Set<string>> {
  const priced = new Set<string>()
  try {
    const ids = rows.map((r) => `mkt:${r.marketTicker}`)
    const known = await db.select({ id: securities.id, name: securities.name, price: securities.closePrice }).from(securities).where(inArray(securities.id, ids))
    for (const k of known) if (k.price != null) priced.add(k.id)

    const missing = rows.filter((r) => !priced.has(`mkt:${r.marketTicker}`))
    if (missing.length > 0) {
      const closes = await latestCloses(missing.map((r) => r.marketTicker))
      for (const row of missing) {
        const close = closes.get(row.marketTicker)
        if (!close) continue
        await storeFirstPrice({ marketTicker: row.marketTicker, kind: row.kind, name: row.name, price: close.price, asOf: close.asOf })
        priced.add(`mkt:${row.marketTicker}`)
      }

      // Whatever the daily bars didn't cover (funds, recent listings) goes to the live-price
      // sources, which take many tickers per request and far more requests per minute than
      // the one-ticker-at-a-time lookup. Last trade is fine here: the catch-up replaces it
      // with the official close.
      const rest = missing.filter((r) => !closes.has(r.marketTicker))
      const quotes = rest.length > 0 ? await createQuoteProvider(process.env, fetch, undefined, { anyAge: true })?.getQuotes(rest.map((r) => r.marketTicker)) : undefined
      for (const row of rest) {
        const quote = quotes?.quotes.get(row.marketTicker)
        if (!quote) continue
        await storeFirstPrice({ marketTicker: row.marketTicker, kind: row.kind, name: row.name, price: quote.price, asOf: quoteDate(quote) })
        priced.add(`mkt:${row.marketTicker}`)
      }

      // Mutual funds are on none of those, but Tiingo publishes their daily price.
      const funds = rest.filter((r) => r.kind === "stock" && !quotes?.quotes.has(r.marketTicker)).slice(0, MAX_FUND_LOOKUPS_PER_IMPORT)
      const tiingoKey = tiingoApiKey(process.env)
      if (funds.length > 0 && tiingoKey) {
        const answer = await tiingoFundCloses(funds.map((r) => r.marketTicker), { apiKey: tiingoKey })
        for (const row of funds) {
          const close = answer.closes.get(row.marketTicker)
          if (!close) continue
          await storeFirstPrice({ marketTicker: row.marketTicker, kind: row.kind, name: row.name, price: close.price, asOf: close.asOf, type: "mutual_fund" })
          priced.add(`mkt:${row.marketTicker}`)
        }
      }
    }

    // A name we were handed fills a blank one; it never replaces a known one.
    const unnamed = new Set(known.filter((k) => !k.name).map((k) => k.id))
    for (const row of rows) {
      if (row.name && unnamed.has(`mkt:${row.marketTicker}`)) {
        await db.update(securities).set({ name: row.name }).where(and(eq(securities.id, `mkt:${row.marketTicker}`), isNull(securities.name)))
      }
    }
  } catch (error) {
    console.error("[positions] price priming failed:", error instanceof Error ? error.message : error)
  }
  return priced
}

/**
 * Stores the first price a security gets. It fills a blank price and never replaces
 * one that is already there, so a real market price can't be overwritten by a weaker source.
 */
async function storeFirstPrice(p: { marketTicker: string; kind: AssetKind; name?: string | null; price: number; asOf: string; type?: string }) {
  await db
    .insert(securities)
    .values({
      id: `mkt:${p.marketTicker}`,
      tickerSymbol: displaySymbol(p.marketTicker),
      name: p.name ?? null,
      type: p.type ?? (p.kind === "crypto" ? "cryptocurrency" : "equity"),
      marketTicker: p.marketTicker,
      closePrice: p.price.toString(),
      closePriceAsOf: p.asOf,
      // It may be a live last trade; the catch-up confirms it against the official close.
      closePriceFinal: false,
    })
    .onConflictDoUpdate({
      target: securities.id,
      set: { closePrice: p.price.toString(), closePriceAsOf: p.asOf, closePriceFinal: false, type: p.type ?? sql`${securities.type}`, updatedAt: new Date() },
      setWhere: isNull(securities.closePrice),
    })
}

/** Fund prices are looked up one ticker per request on a small free allowance, so an import asks for only this many. */
const MAX_FUND_LOOKUPS_PER_IMPORT = 30
/** ...and the catch-up job only this many per run. */
const MAX_FUND_LOOKUPS_PER_RUN = 8

/** How many tickers one import may look up one by one; the provider's free plan allows only a handful a minute. */
const MAX_SINGLE_LOOKUPS = 4

/**
 * A security row with no price yet. The price catch-up finds it (it has no date),
 * so the ticker is priced within minutes instead of the import failing.
 */
async function ensureUnpriced(marketTicker: string, kind: AssetKind, name: string | null | undefined) {
  const id = `mkt:${marketTicker}`
  await db
    .insert(securities)
    .values({
      id,
      tickerSymbol: displaySymbol(marketTicker),
      name: name ?? null,
      type: kind === "crypto" ? "cryptocurrency" : "equity",
      marketTicker,
      // Old on purpose, so the next catch-up picks it up straight away.
      updatedAt: new Date(Date.now() - 86_400_000),
    })
    .onConflictDoNothing()
  return id
}

/**
 * Adds many positions at once. With `replace`, positions the list doesn't
 * mention are removed afterwards, but only when every row went in, so a bad
 * ticker can never leave an account half-emptied.
 */
export async function importPositions(accountId: string, userId: string, rows: ImportRowInput[], { replace }: { replace: boolean }): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, removed: 0, fromFile: [], failed: [], pending: [] }

  const keptSecurityIds = new Set<string>()
  const usable: (ImportRowInput & { marketTicker: string })[] = []
  for (const row of rows) {
    const symbol = row.symbol.trim().toUpperCase()
    if (row.kind === "stock" && isPlanIdentifier(symbol)) {
      // Plan identifiers are not exchange tickers. Scope file prices to this account
      // so another person's import cannot change this holding's valuation.
      if (!row.price || !Number.isFinite(row.price) || row.price <= 0) {
        result.failed.push({ symbol, reason: "This plan holding needs a price in the file. Include Last Price or Current Value." })
        continue
      }
      try {
        const id = `file:${accountId}:${symbol}`
        await db.insert(securities).values({
          id, tickerSymbol: symbol, name: row.name ?? null, type: "fund",
          closePrice: row.price.toString(),
          // No market ticker/date: only a new statement can update this valuation.
        }).onConflictDoUpdate({ target: securities.id, set: {
          name: row.name ?? sql`${securities.name}`, closePrice: row.price.toString(), updatedAt: new Date(),
        } })
        await writeHolding(accountId, userId, id, row)
        await db.update(holdings).set({ institutionValue: (row.quantity * row.price).toFixed(4) })
          .where(and(eq(holdings.accountId, accountId), eq(holdings.securityId, id)))
        keptSecurityIds.add(id)
        result.imported++
        result.fromFile.push(symbol)
      } catch {
        result.failed.push({ symbol, reason: "Couldn't save this plan holding. Try importing it again." })
      }
      continue
    }
    const marketTicker = toMarketTicker(row.symbol, row.kind)
    if (marketTicker) usable.push({ ...row, marketTicker })
    else result.failed.push({ symbol: row.symbol, reason: `Doesn't look like a ${row.kind === "crypto" ? "coin" : "ticker"}` })
  }

  const priced = await primePrices(usable)

  // No market data source prices a mutual fund (the free plans of Massive, Alpaca and
  // Finnhub all decline). The file itself says what each one is worth, so use that for
  // anything still unpriced, rather than leaving it out of the total.
  for (const row of usable) {
    const id = `mkt:${row.marketTicker}`
    if (priced.has(id) || !row.price || !(row.price > 0)) continue
    await storeFirstPrice({ marketTicker: row.marketTicker, kind: row.kind, name: row.name, price: row.price, asOf: latestCompletedSession(new Date()), type: "mutual_fund" })
    priced.add(id)
    result.fromFile.push(row.symbol)
  }

  // One provider hiccup must not cost the rest of the list: a ticker we can't
  // price right now is still saved, and gets its price shortly.
  let singleLookups = 0
  for (const row of usable) {
    const input = { symbol: row.symbol, kind: row.kind, quantity: row.quantity, avgCost: row.avgCost ?? undefined }
    const securityId = `mkt:${row.marketTicker}`
    try {
      if (priced.has(securityId)) {
        await writeHolding(accountId, userId, securityId, input)
      } else if (singleLookups < MAX_SINGLE_LOOKUPS) {
        singleLookups++
        await upsertPosition(accountId, userId, input)
      } else {
        await ensureUnpriced(row.marketTicker, row.kind, row.name)
        await writeHolding(accountId, userId, securityId, input)
        result.pending.push(row.symbol)
      }
      keptSecurityIds.add(securityId)
      result.imported++
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        // The provider looked and this ticker isn't there: a real answer.
        result.failed.push({ symbol: row.symbol, reason: error.message })
      } else {
        // Anything else (busy, down, a network blip) is the provider's problem, not the
        // ticker's: save the holding and price it shortly.
        try {
          await ensureUnpriced(row.marketTicker, row.kind, row.name)
          await writeHolding(accountId, userId, securityId, input)
          keptSecurityIds.add(securityId)
          result.imported++
          result.pending.push(row.symbol)
        } catch {
          result.failed.push({ symbol: row.symbol, reason: "Couldn't add it" })
        }
      }
    }
  }

  if (replace && result.failed.length === 0) {
    const current = await db.select({ id: holdings.id, securityId: holdings.securityId }).from(holdings).where(eq(holdings.accountId, accountId))
    const stale = current.filter((h) => !keptSecurityIds.has(h.securityId)).map((h) => h.id)
    if (stale.length > 0) {
      await db.delete(holdings).where(and(eq(holdings.accountId, accountId), inArray(holdings.id, stale)))
      result.removed = stale.length
    }
  }

  await revalue(accountId)
  return result
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
    .select({ id: securities.id, marketTicker: securities.marketTicker, asOf: securities.closePriceAsOf })
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
    // Never step a price back: a live price from today outranks yesterday's close,
    // and today's official close (same date) replaces the live one.
    if (!close || !isNewerClose(close.asOf, security.asOf)) continue
    await db
      .update(securities)
      .set({ previousClose: previousCloseOnUpdate(close.asOf), closePrice: close.price.toString(), closePriceAsOf: close.asOf, closePriceFinal: true, updatedAt: new Date() })
      .where(eq(securities.id, security.id))
  }

  await revalue()
  return { tickers: held.length, priced: closes.size }
}

let lastRefreshAttempt = 0

/** Per-ticker closes fetched per catch-up run: stays under the provider's free per-minute limit. */
const PREVIOUS_CLOSE_CALLS_PER_RUN = 4

/** Session closes asked of Finnhub per catch-up run: under its 60 calls a minute, with room for live prices. */
const SESSION_CLOSE_CALLS_PER_RUN = 50

/**
 * Brings stored closes up to date when someone opens a page, so a balance never
 * waits a full day on the nightly job. Costs at most one grouped request per
 * market (not per ticker), only for tickers not checked within `maxAgeHours`,
 * and is throttled per server instance so page loads can't spend the provider's
 * free rate limit. Never throws: a stale price beats a broken page.
 */
/**
 * What a catch-up run did. `awaitingClose` counts stocks still without the latest
 * session's official close; `unconfirmed` is the part of those still holding a live
 * price from that session, i.e. a close we know we don't have.
 */
export type CatchUpResult = { refreshed: number; awaitingClose?: number; unconfirmed?: number; failed?: boolean }

export async function refreshStalePrices({
  maxAgeHours = 6,
  minIntervalMinutes = 10,
  recheckMinutes = 15,
  // The nightly job has just fetched the whole-market bars itself; asking again would
  // spend the small free allowance twice within seconds.
  wholeMarket = true,
  now = Date.now(),
} = {}): Promise<CatchUpResult> {
  if (now - lastRefreshAttempt < minIntervalMinutes * 60_000) return { refreshed: 0 }
  lastRefreshAttempt = now

  try {
    const cutoff = new Date(now - maxAgeHours * 3_600_000)
    // Also look when the stored close is older than the latest finished session, so a
    // new official close is picked up shortly after it's published, not hours later.
    const catchUp = { expectedDate: latestCompletedSession(new Date(now)), recheckBefore: new Date(now - recheckMinutes * 60_000) }
    const stale = await db
      .select({ id: securities.id, marketTicker: securities.marketTicker, asOf: securities.closePriceAsOf, final: securities.closePriceFinal, type: securities.type })
      .from(securities)
      .where(staleHeldSecurities(cutoff, catchUp))
      // Least recently checked first, so the per-ticker fallback below rotates through everything.
      .orderBy(securities.updatedAt)
    if (stale.length === 0) return { refreshed: 0, awaitingClose: 0, unconfirmed: 0 }

    // A failed whole-market lookup (a 429 on the free plan, say) must not stop the
    // per-ticker steps below: they are what confirm the latest session's closes.
    const closes = wholeMarket
      ? await latestCloses(stale.map((s) => s.marketTicker!)).catch((error: unknown) => {
          console.error("[positions] whole-market closes failed:", error instanceof Error ? error.message : error)
          return new Map<string, Close>()
        })
      : new Map<string, Close>()
    // Tickers whose entry in `closes` is a live price rather than an official close.
    const provisional = new Set<string>()

    // Securities still without any price (just imported) go to the live-price sources first:
    // many tickers per request, no per-minute squeeze, and the official close replaces it later.
    const unpriced = stale.filter((s) => !s.asOf && !closes.has(s.marketTicker!))
    if (unpriced.length > 0) {
      const quotes = await createQuoteProvider(process.env, fetch, undefined, { anyAge: true })?.getQuotes(unpriced.map((s) => s.marketTicker!))
      for (const security of unpriced) {
        const quote = quotes?.quotes.get(security.marketTicker!)
        if (!quote) continue
        closes.set(security.marketTicker!, { price: quote.price, asOf: quoteDate(quote) })
        provisional.add(security.marketTicker!)
      }
    }

    // The newest price we have for a security: stored, or found above.
    const newest = (s: (typeof stale)[number]) => {
      const found = closes.get(s.marketTicker!)?.asOf
      const stored = s.asOf
      if (!found) return stored
      return !stored || found.slice(0, 10) >= stored.slice(0, 10) ? found : stored
    }

    // Stocks that still lack the official close of the latest finished session: dated
    // before it, or holding a live price from that day (whatever the last refresh before
    // the close caught). The whole-market bars can't help with the second kind: they trail
    // the session by a day on our plan, which is what left a 3pm price standing as the close.
    const wantsClose = stale.filter((s) => {
      if (s.type === "mutual_fund") return false
      const found = closes.get(s.marketTicker!)
      if (found && !provisional.has(s.marketTicker!) && found.asOf.slice(0, 10) >= catchUp.expectedDate) return false
      const stored = s.asOf?.slice(0, 10)
      return !stored || stored < catchUp.expectedDate || (stored === catchUp.expectedDate && !s.final)
    })

    // Once that session is over, Finnhub's quote is its last regular-session print: the
    // consolidated close (the free Alpaca feed is IEX-only and can be off by cents). The
    // calls share Finnhub's 60 a minute with live prices, so a capped batch per run, and a
    // 429 stops it; the rest stay first in line for the next run. During the session the
    // quote is today's price, never the close we want, so it isn't asked then.
    const closeAsked = new Set<string>()
    const finnhubKey = process.env.FINNHUB_API_KEY
    const closeStep = wantsClose.length > 0 && !!finnhubKey && !isUsMarketOpen(new Date(now))
    if (closeStep) {
      // Claim the batch before asking, as live prices do: a server running this at the same
      // moment skips tickers already claimed instead of asking Finnhub for them too, so the
      // cap holds across servers. Claimed tickers wait out the recheck interval whatever the
      // answer, which is also the shared cooldown after a 429.
      const candidates = wantsClose.slice(0, SESSION_CLOSE_CALLS_PER_RUN)
      const claimed = await db
        .update(securities)
        .set({ updatedAt: new Date() })
        .where(and(inArray(securities.id, candidates.map((s) => s.id)), lt(securities.updatedAt, catchUp.recheckBefore)))
        .returning({ id: securities.id })
      for (const { id } of claimed) closeAsked.add(id)
      const batch = candidates.filter((s) => closeAsked.has(s.id))
      const result = batch.length > 0 ? await createFinnhubProvider({ apiKey: finnhubKey! }).getQuotes(batch.map((s) => s.marketTicker!)) : null
      for (const security of batch) {
        const quote = result?.quotes.get(security.marketTicker!)
        if (acceptSessionClose(quote, catchUp.expectedDate)) {
          closes.set(security.marketTicker!, { price: quote.price, asOf: catchUp.expectedDate })
          provisional.delete(security.marketTicker!)
        }
      }
    }

    const stillWanted = (s: (typeof stale)[number]) => {
      const found = closes.get(s.marketTicker!)
      return !found || provisional.has(s.marketTicker!) || found.asOf.slice(0, 10) < catchUp.expectedDate
    }
    // Tickers this run is responsible for and still couldn't confirm. When the Finnhub step
    // ran, only the ones it claimed: another server owns the rest, and the ones over the cap
    // wait for the next run.
    const unresolved = new Set(wantsClose.filter((s) => stillWanted(s) && (!closeStep || closeAsked.has(s.id))).map((s) => s.id))

    // Mutual funds: none of the sources above carry them, Tiingo publishes their daily price
    // (the free allowance is small, so a few per run; the rest wait for the next one).
    const behindSession = (s: { asOf: string | null }) => !s.asOf || s.asOf.slice(0, 10) < catchUp.expectedDate
    const fundBacklog = stale.filter((s) => s.type === "mutual_fund" && !closes.has(s.marketTicker!) && behindSession(s))
    const fundsNow = fundBacklog.slice(0, MAX_FUND_LOOKUPS_PER_RUN)
    const tiingoKey = tiingoApiKey(process.env)
    if (fundsNow.length > 0 && tiingoKey) {
      const answer = await tiingoFundCloses(fundsNow.map((s) => s.marketTicker!), { apiKey: tiingoKey })
      for (const fund of fundsNow) {
        const close = answer.closes.get(fund.marketTicker!)
        if (close) closes.set(fund.marketTicker!, close)
      }
    }
    const fundsWaiting = new Set(fundBacklog.slice(tiingoKey ? MAX_FUND_LOOKUPS_PER_RUN : 0).map((s) => s.id))

    // The whole-market bars can trail a finished session by a day on some plans. The
    // per-ticker "previous close" doesn't, so use it for a few tickers per run (the
    // provider's free tier allows a handful of calls a minute); later runs do the rest.
    // Also a fallback for a live price Finnhub couldn't confirm: `/prev` carries the
    // session's bar once it's published (by the next morning on our plan).
    const behind = stale.filter((s) => {
      // Funds were handled above; the single-ticker lookup here can't price them.
      if (s.type === "mutual_fund") return false
      const have = newest(s)
      return !have || have.slice(0, 10) < catchUp.expectedDate || unresolved.has(s.id)
    })
    const attempted = new Set<string>()
    for (const security of behind.slice(0, PREVIOUS_CLOSE_CALLS_PER_RUN)) {
      attempted.add(security.id)
      try {
        const close = await previousClose(security.marketTicker!)
        if (close) closes.set(security.marketTicker!, close)
      } catch (error) {
        if (error instanceof MarketDataError && error.status === 429) break
        // One ticker failing shouldn't stop the others.
      }
    }

    // A ticker that is behind and wasn't looked up this run (over the per-run call
    // cap) is left alone, so it stays first in line for the next run instead of
    // waiting out the recheck interval.
    // Ones we did look up but that came back empty (an unknown ticker, a fund the provider
    // doesn't cover) are marked checked and go to the back, so they can't hog every run.
    const notAsked = (s: (typeof stale)[number]) => !attempted.has(s.id) && !closeAsked.has(s.id)
    const skipped = new Set([
      ...behind.filter((s) => !closes.has(s.marketTicker!) && notAsked(s)).map((s) => s.id),
      // Only when the close lookup ran: then these were over its cap. Otherwise (market
      // open, no key) they are marked checked and wait out the recheck interval.
      ...(closeStep ? wantsClose.filter((s) => stillWanted(s) && notAsked(s)).map((s) => s.id) : []),
      ...fundsWaiting,
    ])

    let refreshed = 0
    for (const security of stale) {
      if (skipped.has(security.id)) continue
      const found = closes.get(security.marketTicker!)
      // A close that isn't newer than what we hold (weekend, holiday, or a live
      // price from today) still counts as checked, but never replaces it.
      const close = found && isNewerClose(found.asOf, security.asOf) ? found : undefined
      const final = !provisional.has(security.marketTicker!)
      await db
        .update(securities)
        .set(
          close
            ? { previousClose: previousCloseOnUpdate(close.asOf), closePrice: close.price.toString(), closePriceAsOf: close.asOf, closePriceFinal: final, updatedAt: new Date() }
            : { updatedAt: new Date() },
        )
        .where(eq(securities.id, security.id))
      if (close) refreshed++
    }
    if (refreshed > 0) await revalue()
    // Stocks still without the latest session's official close after this run, so a
    // response (and the cron's log) says how fresh prices really are, not just what was tried.
    const awaiting = wantsClose.filter(stillWanted)
    // Counted in the database, not from this run's view: another server may have confirmed
    // (or still be confirming) tickers this run left to it.
    const [{ unconfirmed }] = await db
      .select({ unconfirmed: sql<number>`count(*)::int` })
      .from(securities)
      .where(
        and(
          eq(securities.closePriceAsOf, catchUp.expectedDate),
          eq(securities.closePriceFinal, false),
          sql`${securities.marketTicker} NOT LIKE 'X:%'`,
          sql`(EXISTS (SELECT 1 FROM holdings h WHERE h.security_id = ${securities.id})
            OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = ${securities.id}))`,
        ),
      )
    if (unconfirmed > 0) console.warn(`[positions] ${unconfirmed} live price(s) from ${catchUp.expectedDate} still lack the official close`)
    return { refreshed, awaitingClose: awaiting.length, unconfirmed }
  } catch (error) {
    console.error("[positions] price refresh failed:", error instanceof Error ? error.message : error)
    // A failure shouldn't lock refreshing out for the whole interval: retry in a minute.
    lastRefreshAttempt = now - (minIntervalMinutes - 1) * 60_000
    return { refreshed: 0, failed: true }
  }
}

/**
 * Recomputes holding values and manual account balances from stored closes.
 * With an account id, only that account — including one whose last position
 * was just removed, which drops to zero.
 */
async function revalue(accountId?: string, securityIds?: string[]) {
  const onlyAccount = accountId ? sql`AND h.account_id = ${accountId}` : sql``
  const idList = securityIds && securityIds.length > 0 ? sql.join(securityIds.map((id) => sql`${id}`), sql`, `) : null
  const onlySecurities = idList ? sql`AND h.security_id IN (${idList})` : sql``

  await db.execute(sql`
    UPDATE holdings h
    SET institution_value = h.quantity * s.close_price, updated_at = now()
    FROM securities s
    WHERE s.id = h.security_id AND s.market_ticker IS NOT NULL ${onlyAccount} ${onlySecurities}
  `)

  // With a list of securities, only the accounts that hold them need a new balance.
  const affected = accountId
    ? sql`a.id = ${accountId}`
    : idList
      ? sql`a.id IN (SELECT account_id FROM holdings WHERE security_id IN (${idList}))`
      : sql`EXISTS (SELECT 1 FROM holdings WHERE account_id = a.id)`

  await db.execute(sql`
    UPDATE accounts a
    SET current_balance = COALESCE((SELECT sum(institution_value) FROM holdings WHERE account_id = a.id), 0),
        updated_at = now()
    WHERE a.source = 'manual' AND ${affected}
  `)
}

/** Revalues only the holdings and manual accounts that depend on these securities. */
export async function revalueSecurities(securityIds: string[]) {
  if (securityIds.length > 0) await revalue(undefined, securityIds)
}
