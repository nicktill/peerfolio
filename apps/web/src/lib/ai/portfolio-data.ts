import "server-only"
import { and, eq } from "drizzle-orm"
import { accounts, db, holdings, securities } from "@web/db"
import type { PositionInput } from "@web/lib/dashboard-math"
import { effectiveSecurityType } from "@web/lib/known-etfs"
import { loadLivePoints, loadSnapshots, timeWeightedReturn, withLivePoint } from "@web/lib/returns"
import { buildXRay, type XRay } from "@web/lib/ai/portfolio-xray"

const n = (v: string | null) => (v == null ? 0 : Number(v))

/**
 * The signed-in user's open positions, in the shape the dashboard math takes.
 * Scoped by `userId` in the query itself, and limited to active accounts as the
 * portfolio page is, so a removed account never reaches an analysis.
 */
export async function loadPositions(userId: string): Promise<PositionInput[]> {
  const rows = await db
    .select({
      quantity: holdings.quantity,
      costBasis: holdings.costBasis,
      institutionValue: holdings.institutionValue,
      securityId: securities.id,
      ticker: securities.tickerSymbol,
      name: securities.name,
      type: securities.type,
      metadataCheckedAt: securities.metadataCheckedAt,
      closePrice: securities.closePrice,
      closePriceAsOf: securities.closePriceAsOf,
      previousClose: securities.previousClose,
    })
    .from(holdings)
    .innerJoin(securities, eq(holdings.securityId, securities.id))
    .innerJoin(accounts, eq(holdings.accountId, accounts.id))
    .where(and(eq(holdings.userId, userId), eq(accounts.userId, userId), eq(accounts.isActive, true)))

  return rows.map((h) => ({
    securityId: h.securityId,
    ticker: h.ticker,
    name: h.name,
    type: effectiveSecurityType(h.type, h.ticker, h.metadataCheckedAt !== null),
    quantity: n(h.quantity),
    value: n(h.institutionValue) || n(h.quantity) * n(h.closePrice),
    costBasis: h.costBasis == null ? null : n(h.costBasis),
    price: n(h.closePrice),
    previousClose: h.previousClose == null ? null : n(h.previousClose),
    priceAsOf: h.closePriceAsOf,
  }))
}

/** The user's three-month time-weighted return and series, or null when fewer than two tracked days back it. */
async function trackedWindow(userId: string) {
  const [snapshots, live] = await Promise.all([loadSnapshots([userId], "3M"), loadLivePoints([userId])])
  const stored = snapshots.get(userId) ?? []
  const liveNow = live.get(userId)
  const points = liveNow ? withLivePoint(stored, liveNow, new Date().toISOString().slice(0, 10)) : stored
  if (points.length < 2) return null
  const result = timeWeightedReturn(points, "investableAssets")
  return { period: { percent: result.percent, days: result.days, range: "3M" }, series: result.series.map((p) => ({ date: p.date, indexed: p.indexed })) }
}

export async function loadXRay(userId: string): Promise<XRay> {
  const [positions, window] = await Promise.all([loadPositions(userId), trackedWindow(userId)])
  return buildXRay({ positions, period: window?.period ?? null, series: window?.series })
}
