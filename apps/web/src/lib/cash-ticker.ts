/** Plaid reports uninvested cash as a security with a `CUR:` ticker, e.g. `CUR:USD`. */
export const isCashTicker = (ticker: string | null | undefined): ticker is `CUR:${string}` => /^CUR:[A-Z]{3}$/i.test(ticker?.trim() ?? "")

/** What a cash row says: "Cash", with the currency underneath (US dollars for the common case). */
export function cashLabel(ticker: string): { title: string; subtitle: string } {
  const code = ticker.trim().slice(4).toUpperCase()
  return { title: "Cash", subtitle: code === "USD" ? "US dollars" : code }
}
