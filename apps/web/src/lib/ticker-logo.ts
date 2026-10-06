import { massiveFetch, tickerDetails } from "./market-data.ts"

/**
 * What a logo lookup found, kept apart so the route can cache each differently:
 * - `found`: the image, cached for a month.
 * - `none`: Massive says there is no logo, so a miss is cached for a day.
 * - `unavailable`: we couldn't ask (budget spent, cooldown, a provider error), so
 *   nothing is cached and the next page view asks again.
 */
export type LogoLookup = { kind: "found"; image: Response } | { kind: "none" } | { kind: "unavailable" }

/** The icon (or logo) for `marketTicker`. Costs up to two Massive requests. */
export async function lookupTickerLogo(marketTicker: string, key: string, fetchImpl: typeof fetch = massiveFetch): Promise<LogoLookup> {
  try {
    const details = await tickerDetails(marketTicker, fetchImpl)
    const source = details?.iconUrl ?? details?.logoUrl
    if (!source) return { kind: "none" }

    // The image is served by Massive with our key, so it spends from the same budget.
    const image = await fetchImpl(source, { headers: { Authorization: `Bearer ${key}` } })
    if (image.ok) return { kind: "found", image }
    return image.status === 404 ? { kind: "none" } : { kind: "unavailable" }
  } catch {
    return { kind: "unavailable" }
  }
}
