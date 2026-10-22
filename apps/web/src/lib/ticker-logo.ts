/**
 * Company icons from Parqet's public logo CDN. `next.config.ts` rewrites
 * `/api/market/logo/:symbol` to Parqet at the CDN, so the browser talks only to
 * us and no function runs: a proxied route cost ~100 ms of CPU per image, and
 * every deploy emptied its edge cache. Parqet's own cache headers apply (a hit
 * for a day, a miss for 12 hours); a miss is a 404 and the client falls back to
 * a monogram.
 */

/** Parqet writes share classes with a hyphen (BRK-B); brokerages write BRK.B, BRK-B or BRK/B. */
export function parqetSymbol(symbol: string): string | null {
  const s = symbol.trim().toUpperCase().replace(/[./]/g, "-")
  return /^[A-Z][A-Z0-9]{0,5}(-[A-Z0-9]{1,2})?$/.test(s) ? s : null
}

/** The logo URL for a ticker, or null when it can't be one (the caller shows a monogram). */
export function tickerLogoSrc(symbol: string): string | null {
  const s = parqetSymbol(symbol)
  return s ? `/api/market/logo/${s}` : null
}
