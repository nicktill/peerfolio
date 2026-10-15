/**
 * Whether a ticker is a mutual fund, decided before any provider is asked.
 *
 * Mutual funds are priced by Tiingo alone: Finnhub answers 403 for them and
 * Massive has no daily bar, so asking either is a guaranteed wasted call.
 * US fund tickers are five letters ending in X (FSPSX, VWUAX).
 *
 * Plain data and no imports besides the ETF list, so the tests can run it directly.
 */

import { KNOWN_ETFS } from "./known-etfs.ts"

const FUND_SHAPE = /^[A-Z]{4}X$/

export function isFundTicker({
  marketTicker,
  type,
  providerChecked = false,
}: {
  marketTicker: string | null | undefined
  /** The stored security type, when the row exists. */
  type?: string | null
  name?: string | null
  /**
   * A provider already confirmed this row as a stock (its type was set from
   * the provider's own answer, not defaulted to "equity" on insert).
   */
  providerChecked?: boolean
}): boolean {
  if (type === "mutual_fund") return true
  // Anything the provider typed as something else is not a fund.
  if (type === "etf" || type === "cryptocurrency" || type === "fund") return false
  if (type === "equity" && providerChecked) return false
  const ticker = marketTicker?.trim().toUpperCase()
  if (!ticker || !FUND_SHAPE.test(ticker)) return false
  return !KNOWN_ETFS.has(ticker)
}

/**
 * Compatibility inference for existing rows. Failed/untyped lookups must classify an
 * unconfirmed fund-shaped row before recording a retry timestamp. Legacy rows can be ambiguous.
 */
export function isProviderChecked(row: { metadataCheckedAt?: Date | null; name?: string | null } | null | undefined): boolean {
  return !!(row?.metadataCheckedAt && row.name)
}

/**
 * After a details lookup: whether a fund-shaped ticker must be typed as a fund. True when the
 * provider returned no type (a null answer, or one with no stock/ETF type) and the row was not
 * confirmed by an earlier lookup. The caller leaves `metadataCheckedAt` unset for these funds.
 */
export function unconfirmedFund(
  marketTicker: string,
  row: { type?: string | null; metadataCheckedAt?: Date | null; name?: string | null },
  providerType: string | null | undefined,
): boolean {
  if (providerType || isProviderChecked(row)) return false
  return isFundTicker({ marketTicker, type: row.type })
}

/** Keep the existing retry delay without turning a failed fund lookup into equity confirmation. */
export function failedMetadataUpdate(
  marketTicker: string,
  row: { type?: string | null; metadataCheckedAt?: Date | null; name?: string | null },
  now: number,
): { type?: "mutual_fund"; metadataCheckedAt: Date | null } {
  if (unconfirmedFund(marketTicker, row, null)) return { type: "mutual_fund", metadataCheckedAt: null }
  return { metadataCheckedAt: new Date(now - 6 * 86_400_000) }
}
