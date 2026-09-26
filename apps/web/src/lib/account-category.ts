/**
 * Account bucketing. Pure so it can be unit tested without pulling in the
 * database — `plaid-sync` is server-only.
 */

export type AccountCategory = "investment" | "cash" | "credit" | "loan" | "other"

/**
 * Maps a Plaid account to the bucket that drives net worth and league scoring.
 * Plaid's own `type` is authoritative, so we branch on it before falling back
 * to subtype string matching.
 */
export function categorizeAccount(type?: string | null, subtype?: string | null): AccountCategory {
  const t = (type ?? "").toLowerCase()
  const s = (subtype ?? "").toLowerCase()

  if (t === "investment" || t === "brokerage") return "investment"
  if (t === "credit") return "credit"
  if (t === "loan") return "loan"
  if (t === "depository") return "cash"

  if (/401k|403b|457b|ira|roth|brokerage|hsa|529|pension|keogh|sarsep|sep|simple|stock|ugma|utma/.test(s)) {
    return "investment"
  }
  if (/credit card|paypal|rewards/.test(s)) return "credit"
  if (/mortgage|student|auto|line of credit|home equity|construction|consumer|loan/.test(s)) return "loan"
  if (/checking|savings|money market|cash management|cd|prepaid|ebt/.test(s)) return "cash"

  return "other"
}
