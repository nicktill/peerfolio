/**
 * Display sectors for the X-Ray. Finnhub's `finnhubIndustry` is its own taxonomy, not GICS, so it is
 * mapped to a small fixed set here; anything the rules don't recognise stays "Other" rather than being
 * guessed. Free of database and framework imports so it can be tested directly.
 */

export const SECTORS = [
  "Technology",
  "Financials",
  "Health Care",
  "Consumer Discretionary",
  "Consumer Staples",
  "Communication Services",
  "Industrials",
  "Energy",
  "Utilities",
  "Real Estate",
  "Materials",
] as const

export type Sector = (typeof SECTORS)[number]

/** What a stock whose provider industry matches no rule is shown as. */
export const OTHER_SECTOR = "Other"

/** Funds, crypto and cash have no single sector; they get their own buckets. */
export const FUNDS_BUCKET = "Funds & ETFs"
export const CRYPTO_BUCKET = "Crypto"
export const CASH_BUCKET = "Cash & bonds"

/**
 * First match wins, so narrower phrases come before the broad ones they contain
 * ("communications equipment" is technology; "gas utilities" is not energy).
 */
const RULES: [RegExp, Sector][] = [
  [/utilit|electric(ity)?$|independent power/, "Utilities"],
  [/real estate|reit/, "Real Estate"],
  [/pharma|biotech|health|life sciences|medical/, "Health Care"],
  [/communications? equipment|semiconductor|software|technology|it services|electronic/, "Technology"],
  [/telecom|communications?$|^media|entertainment|publishing|broadcast/, "Communication Services"],
  [/bank|insurance|financial|capital markets|asset management|brokerage|diversified financ/, "Financials"],
  [/oil|petroleum|coal|energy|natural gas/, "Energy"],
  [/chemical|metals|mining|steel|paper|forest|packaging|containers|construction materials|gold/, "Materials"],
  [/beverage|food|tobacco|personal products|household products|staples/, "Consumer Staples"],
  [/automobile|auto components|hotel|restaurant|leisure|apparel|luxury|textile|retail|distributors|diversified consumer|homebuild|specialty stores/, "Consumer Discretionary"],
  [/aerospace|defense|machinery|electrical equipment|transportation|airline|logistics|freight|road & rail|marine|trading companies|commercial services|professional services|conglomerate|engineering|building|construction|infrastructure|waste/, "Industrials"],
]

/** The display sector for a Finnhub industry string; "Other" when no rule matches, null when there is no string. */
export function mapIndustryToSector(industry: string | null | undefined): Sector | typeof OTHER_SECTOR | null {
  const text = industry?.trim().toLowerCase()
  if (!text) return null
  return RULES.find(([pattern]) => pattern.test(text))?.[1] ?? OTHER_SECTOR
}

export type SectorBucket =
  | { kind: "sector"; name: string }
  | { kind: "bucket"; name: string }
  | { kind: "unclassified"; name: string }

/** Where a position falls: its sector (stocks with one), a fixed non-stock bucket, or unclassified. */
export function classifyPosition(type: string | null, sector: string | null): SectorBucket {
  switch (type) {
    case "etf":
    case "mutual_fund":
    case "fund":
      return { kind: "bucket", name: FUNDS_BUCKET }
    case "cryptocurrency":
      return { kind: "bucket", name: CRYPTO_BUCKET }
    case "cash":
    case "fixed_income":
      return { kind: "bucket", name: CASH_BUCKET }
    case "equity":
      return sector ? { kind: "sector", name: sector } : { kind: "unclassified", name: "Stocks without sector data" }
    default:
      return { kind: "unclassified", name: "Other holdings" }
  }
}
