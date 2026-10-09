/**
 * Company icons from Parqet's public logo CDN, one request per ticker.
 * The logo route caches a hit for a month, so a ticker is fetched once.
 *
 * - `found`: an image, cached for a month.
 * - `none`: Parqet has no logo (404), so a miss is cached for a day.
 * - `unavailable`: the CDN could not be asked, so nothing is cached and the next view tries again.
 */
export type LogoLookup = { kind: "found"; image: Response } | { kind: "none" } | { kind: "unavailable" }

const PARQET = "https://assets.parqet.com/logos/symbol"

/** Parqet writes share classes with a hyphen (BRK-B); tickers here use a dot (BRK.B). */
export function parqetLogoUrl(marketTicker: string): string {
  return `${PARQET}/${encodeURIComponent(marketTicker.replaceAll(".", "-"))}`
}

/** The icon for `marketTicker`, or a miss when Parqet has none. */
export async function lookupTickerLogo(marketTicker: string, fetchImpl: typeof fetch = fetch): Promise<LogoLookup> {
  try {
    const image = await fetchImpl(parqetLogoUrl(marketTicker), { signal: AbortSignal.timeout(8_000) })
    const type = image.headers.get("content-type") ?? ""
    if (image.ok && type.startsWith("image/")) return { kind: "found", image }
    if (image.status === 404) return { kind: "none" }
    return { kind: "unavailable" }
  } catch {
    return { kind: "unavailable" }
  }
}
