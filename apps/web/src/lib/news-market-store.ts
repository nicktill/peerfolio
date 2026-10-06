import "server-only"
import { db, newsMarketCache, securities } from "@web/db"
import { and, inArray, isNotNull, sql } from "drizzle-orm"
import { providerFetch, withProviderPatience } from "@web/lib/provider-fetch"
import { alpacaCompanyNames, fetchMarketBoard, fetchEarningsWeek, fetchFearGreed, nyDate, type MarketBoard, type EarningsWeekData, type FearGreedReading } from "@web/lib/news-market"
import type { NewsSlot } from "@web/lib/news-schedule"
const auth = () => process.env.ALPACA_API_KEY && process.env.ALPACA_API_SECRET ? { keyId: process.env.ALPACA_API_KEY, secret: process.env.ALPACA_API_SECRET } : null
async function save(key: string, payload: unknown, now: Date) {
  if (!payload) return
  await db.insert(newsMarketCache).values({ key, payload, updatedAt: now }).onConflictDoUpdate({ target: newsMarketCache.key, set: { payload, updatedAt: now }, setWhere: sql`${newsMarketCache.updatedAt} < ${now.toISOString()}::timestamptz` })
}
/** Each failed component retains its previous successful value. */
export async function updateNewsMarket(slot: NewsSlot, now: Date) {
  const board = await withProviderPatience(35_000, () => fetchMarketBoard({ finnhubKey: process.env.FINNHUB_API_KEY, alpaca: auth(), now, requiredSession: nyDate(now), indexesOnly: slot === "morning", fetchImpl: (url, init) => (url.includes("finnhub.io") ? providerFetch("finnhub") : providerFetch("alpaca"))(url, init) })).catch(() => null)
  // Do not publish yesterday's quotes as today's morning/closing update, or overwrite complete cards with partial data.
  const fresh = board?.session === nyDate(now) && board.indexes.length === 4 && (slot === "morning" || board.sectors.length === 11) ? board : null
  if (fresh) {
    await save("board", fresh, now)
    if (slot === "close") await save("closingBoard", fresh, now)
  }
  if (slot === "morning") return { board: fresh, earnings: null, fearGreed: null }
  const [earnings, fearGreed] = await Promise.all([
    withProviderPatience(35_000, () => fetchEarningsWeek({ finnhubKey: process.env.FINNHUB_API_KEY, now, fetchImpl: providerFetch("finnhub"), knownNames: async symbols => {
      if (!symbols.length) return new Map<string, string>()
      const rows = await db.select({ symbol: securities.tickerSymbol, name: securities.name }).from(securities).where(and(inArray(securities.tickerSymbol, symbols), isNotNull(securities.name)))
      return new Map(rows.flatMap(r => r.symbol && r.name ? [[r.symbol, r.name] as const] : []))
    }, allNames: async () => { const a = auth(); return a ? alpacaCompanyNames(a, providerFetch("alpaca")) : new Map<string, string>() } })).catch(() => null),
    fetchFearGreed(fetch, now).catch(() => null),
  ])
  await Promise.all([save("earnings", earnings, now), save("fearGreed", fearGreed, now)])
  return { board: fresh, earnings, fearGreed }
}
export async function readNewsMarket() {
  const rows = await db.select().from(newsMarketCache)
  const get = <T>(key: string) => (rows.find(r => r.key === key)?.payload as T | undefined) ?? null
  const board = get<MarketBoard>("board")
  const earnings = get<EarningsWeekData>("earnings")
  const today = nyDate(new Date())
  const closingBoard = get<MarketBoard>("closingBoard")
  return { board: board ? { ...board, sectors: closingBoard?.sectors ?? [] } : closingBoard, closingBoard, sectorsAsOf: closingBoard?.asOf ?? null, earnings: earnings ? { ...earnings, days: earnings.days.map(d => ({ ...d, today: d.iso === today, past: Boolean(d.iso && d.iso < today) })) } : null, fearGreed: get<FearGreedReading>("fearGreed") }
}
