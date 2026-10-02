import { NextResponse } from "next/server"
import { and, ilike, isNotNull, notLike, or } from "drizzle-orm"
import { db, securities } from "@web/db"
import { withUser } from "@web/lib/api"
import { displaySymbol, searchTickers } from "@web/lib/market-data"
import { normalizeQuery, rankSuggestions, type TickerSuggestion } from "@web/lib/ticker-search"

const LIMIT = 6
const PROVIDER_TTL_MS = 24 * 60 * 60_000
const PROVIDER_CACHE_MAX = 500

/**
 * Provider answers per query, kept for a day. The provider's free plan allows
 * only a handful of requests a minute, and the quote preview shares that budget,
 * so the same prefix typed by everyone in a league costs one request.
 */
const providerCache = new Map<string, { at: number; results: TickerSuggestion[] }>()

async function providerMatches(query: string): Promise<TickerSuggestion[]> {
  const key = query.toUpperCase()
  const hit = providerCache.get(key)
  if (hit && Date.now() - hit.at < PROVIDER_TTL_MS) return hit.results
  // A failure (rate limit, no key) just means fewer suggestions; it isn't cached.
  const results = await searchTickers(query, "stock", { limit: 50 }).catch(() => null)
  if (!results) return []
  providerCache.delete(key)
  providerCache.set(key, { at: Date.now(), results })
  while (providerCache.size > PROVIDER_CACHE_MAX) {
    const oldest = providerCache.keys().next().value
    if (oldest === undefined) break
    providerCache.delete(oldest)
  }
  return results
}

/** Stocks we already price, matched by symbol prefix or name. Free, so it's asked first. */
async function knownMatches(query: string): Promise<TickerSuggestion[]> {
  const escaped = query.replace(/[\\%_]/g, (c) => `\\${c}`)
  const rows = await db
    .select({ marketTicker: securities.marketTicker, name: securities.name })
    .from(securities)
    .where(
      and(
        isNotNull(securities.marketTicker),
        notLike(securities.marketTicker, "X:%"),
        or(ilike(securities.marketTicker, `${escaped}%`), ilike(securities.name, `%${escaped}%`)),
      ),
    )
    .limit(40)
  return rows.flatMap((r) => (r.marketTicker ? [{ symbol: displaySymbol(r.marketTicker), name: r.name }] : []))
}

/**
 * Ticker autocomplete for the trade panel: up to six stocks whose symbol starts
 * with, or whose company name contains, what was typed. Empty when nothing
 * matches; the quote preview still explains an unknown ticker.
 */
export const GET = withUser<unknown>(async (_userId, request) => {
  const query = normalizeQuery(new URL(request.url).searchParams.get("q") ?? "")
  if (!query) return NextResponse.json({ results: [] })

  const known = await knownMatches(query).catch(() => [])
  let ranked = rankSuggestions(query, [known], LIMIT)
  // Only spend a provider request when what we know can't fill the list.
  if (ranked.length < LIMIT) ranked = rankSuggestions(query, [known, await providerMatches(query)], LIMIT)
  return NextResponse.json({ results: ranked }, { headers: { "Cache-Control": "private, max-age=300" } })
})
