import { effectiveSecurityType } from "@web/lib/known-etfs"
import { NextResponse } from "next/server"
import { and, asc, eq, gte, min } from "drizzle-orm"
import { db, holdings, accounts, plaidItems, portfolioSnapshots, securities } from "@web/db"
import { withUser } from "@web/lib/api"
import { scheduleLiveRefresh } from "@web/lib/live-quotes"
import { allTimeGain, summarizeHoldings, todayChange, type PositionInput } from "@web/lib/dashboard-math"
import { refreshStalePrices, scheduleMetadataRefresh } from "@web/lib/positions"
import { buildLeagueStandings, listLeaguesForUser } from "@web/lib/social"
import { isRange, rangeStart, timeWeightedReturn, withLivePoint, type Range } from "@web/lib/returns"

const n = (v: string | null) => (v == null ? 0 : Number(v))

const LIABILITY = new Set(["credit", "loan"])

/** Human labels for the allocation ring, keyed by Plaid security type. */
const SECURITY_LABELS: Record<string, string> = {
  fund: "Plan funds",
  equity: "Stocks",
  etf: "ETFs",
  mutual_fund: "Mutual funds",
  fixed_income: "Bonds",
  cash: "Cash",
  derivative: "Derivatives",
  cryptocurrency: "Crypto",
  other: "Other",
}

/**
 * Everything the dashboard renders, assembled server-side from stored data.
 *
 * The history series is real: it comes from `portfolio_snapshots` and is only
 * as long as the user has been connected. Nothing here is synthesized.
 */
export const GET = withUser<unknown>(async (userId, request) => {
  const url = new URL(request.url)
  const rangeParam = url.searchParams.get("range") ?? "1M"
  const range: Range = isRange(rangeParam) ? rangeParam : "1M"

  // Bring stored closes up to date first so balances below are current, not
  // last night's. Throttled and never throws.
  if (url.searchParams.get("stored") !== "1") {
    await refreshStalePrices()
    scheduleLiveRefresh()
    scheduleMetadataRefresh()
  }

  const [accountRows, items, holdingRows] = await Promise.all([
    db.select().from(accounts).where(and(eq(accounts.userId, userId), eq(accounts.isActive, true))),
    db.select().from(plaidItems).where(eq(plaidItems.userId, userId)),
    db
      .select({
        id: holdings.id,
        quantity: holdings.quantity,
        costBasis: holdings.costBasis,
        institutionValue: holdings.institutionValue,
        accountId: holdings.accountId,
        securityId: securities.id,
        ticker: securities.tickerSymbol,
        securityName: securities.name,
        securityType: securities.type,
        metadataCheckedAt: securities.metadataCheckedAt,
        closePrice: securities.closePrice,
        closePriceAsOf: securities.closePriceAsOf,
        previousClose: securities.previousClose,
      })
      .from(holdings)
      .innerJoin(securities, eq(holdings.securityId, securities.id))
      .where(eq(holdings.userId, userId)),
  ])

  const start = rangeStart(range)
  const snapshotRows = await db
    .select()
    .from(portfolioSnapshots)
    .where(
      start
        ? and(eq(portfolioSnapshots.userId, userId), gte(portfolioSnapshots.date, start))
        : eq(portfolioSnapshots.userId, userId),
    )
    .orderBy(asc(portfolioSnapshots.date))

  // Where tracking began, whatever the range: it decides which ranges have enough history behind them.
  const [firstRow] = await db.select({ first: min(portfolioSnapshots.date) }).from(portfolioSnapshots).where(eq(portfolioSnapshots.userId, userId))

  let totalAssets = 0
  let totalLiabilities = 0
  let investableAssets = 0

  const accountsByItem = new Map(items.map((i) => [i.id, i]))

  const accountPayload = accountRows.map((account) => {
    const balance = Math.abs(n(account.currentBalance))
    const isLiability = LIABILITY.has(account.category)

    if (isLiability) totalLiabilities += balance
    else {
      totalAssets += balance
      if (account.category === "investment") investableAssets += balance
    }

    const item = account.itemId ? accountsByItem.get(account.itemId) : undefined
    return {
      id: account.id,
      name: account.name,
      officialName: account.officialName,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      category: account.category,
      balance,
      isLiability,
      source: account.source,
      institutionName: item?.institutionName ?? account.institutionLabel ?? "Manual account",
      institutionLogo: item?.institutionLogo ?? null,
      itemId: account.itemId,
      positions:
        account.source === "manual"
          ? holdingRows
              .filter((h) => h.accountId === account.id)
              .map((h) => ({
                id: h.id,
                ticker: h.ticker,
                name: h.securityName,
                kind: h.securityType === "cryptocurrency" ? ("crypto" as const) : ("stock" as const),
                quantity: n(h.quantity),
                price: n(h.closePrice),
                value: n(h.institutionValue),
                costBasis: h.costBasis == null ? null : n(h.costBasis),
                priceAsOf: h.closePriceAsOf,
              }))
              .sort((a, b) => b.value - a.value)
          : [],
    }
  })

  const netWorth = totalAssets - totalLiabilities

  // A ticker the provider hasn't classified yet reads as a stock; the known-ETF list covers that gap.
  const typeOf = (h: { securityType: string | null; ticker: string | null; metadataCheckedAt: Date | null }) =>
    effectiveSecurityType(h.securityType, h.ticker, h.metadataCheckedAt !== null)

  // Allocation prefers real security types and falls back to account buckets
  // for users whose institutions return no holdings.
  const allocationMap = new Map<string, number>()
  for (const h of holdingRows) {
    const value = n(h.institutionValue) || n(h.quantity) * n(h.closePrice)
    if (value <= 0) continue
    const label = SECURITY_LABELS[typeOf(h) ?? "other"] ?? "Other"
    allocationMap.set(label, (allocationMap.get(label) ?? 0) + value)
  }

  if (allocationMap.size === 0) {
    for (const account of accountPayload) {
      if (account.isLiability) continue
      const label = account.category === "investment" ? "Investments" : account.category === "cash" ? "Cash" : "Other"
      allocationMap.set(label, (allocationMap.get(label) ?? 0) + account.balance)
    }
  }

  const allocationTotal = [...allocationMap.values()].reduce((a, b) => a + b, 0)
  const allocation = [...allocationMap.entries()]
    .map(([name, value]) => ({ name, value, percent: allocationTotal > 0 ? (value / allocationTotal) * 100 : 0 }))
    .sort((a, b) => b.value - a.value)

  const positionInputs: PositionInput[] = holdingRows.map((h) => ({
    securityId: h.securityId,
    ticker: h.ticker,
    name: h.securityName,
    type: typeOf(h),
    quantity: n(h.quantity),
    value: n(h.institutionValue) || n(h.quantity) * n(h.closePrice),
    costBasis: h.costBasis == null ? null : n(h.costBasis),
    price: n(h.closePrice),
    previousClose: h.previousClose == null ? null : n(h.previousClose),
    priceAsOf: h.closePriceAsOf,
  }))
  // One row per security however many accounts hold it, so the same fund in two
  // accounts is one line.
  const holdingSummaries = summarizeHoldings(positionInputs)
  const today = todayChange(positionInputs, netWorth)
  const allTime = allTimeGain(positionInputs)

  // Where you stand in each league, for the pills by the headline. A failure
  // here must never cost someone their portfolio page.
  const leaguePills = await listLeaguesForUser(userId)
    .then((rows) =>
      Promise.all(
        rows.map(async (row) => {
          const standing = await buildLeagueStandings(row.id, userId, "1M")
            .then((all) => all.find((s) => s.isYou))
            .catch(() => undefined)
          return { id: row.id, name: row.name, emoji: row.emoji, rank: standing?.hasHistory ? standing.rank : null, members: row.memberCount }
        }),
      ),
    )
    .catch(() => [])

  const isVerified = accountRows.length > 0 && accountRows.every((a) => a.source === "plaid")

  // Snapshots are nightly, so end the series on today's live value.
  const points = withLivePoint(
    snapshotRows.map((row) => ({
      date: row.date,
      netWorth: n(row.netWorth),
      investableAssets: n(row.investableAssets),
      netFlows: n(row.netFlows),
      isVerified: row.isVerified,
    })),
    { netWorth, investableAssets, isVerified },
    new Date().toISOString().slice(0, 10),
  )

  const performance = timeWeightedReturn(points, "investableAssets")

  return NextResponse.json({
    summary: { totalAssets, totalLiabilities, netWorth, investableAssets },
    accounts: accountPayload,
    items: items
      .filter((i) => i.status !== "disconnected")
      .map((i) => ({
        id: i.id,
        institutionName: i.institutionName,
        institutionLogo: i.institutionLogo,
        status: i.status,
        errorCode: i.errorCode,
        lastSyncedAt: i.lastSyncedAt,
      })),
    allocation,
    holdings: holdingSummaries,
    today,
    allTime,
    leagues: leaguePills,
    history: points.map((p) => ({ date: p.date, netWorth: p.netWorth, investableAssets: p.investableAssets })),
    performance: {
      percent: performance.percent,
      days: performance.days,
      range,
      // Indexed to 100 at the window's start, net of deposits — the same
      // measure as `percent`. The dollar series lives in `history`.
      series: performance.series.map((p) => ({ date: p.date, indexed: Math.round(p.indexed * 100) / 100 })),
    },
    /** Two snapshots is the minimum for any return to exist. */
    hasHistory: points.length >= 2,
    /** The first day we tracked this portfolio (YYYY-MM-DD), or null. */
    firstDate: firstRow?.first ?? null,
    /** Plaid-backed portfolios are the only ones eligible for the public board. */
    isVerified,
  })
})
