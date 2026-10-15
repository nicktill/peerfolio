import "server-only"
import { nyDate } from "@web/lib/news-market"
import { board, earnings, fearGreed, movers, quotesFor } from "@web/lib/news-market-cache"
import { earningsWeekDates } from "@web/lib/news-market"
import { loadPositions } from "@web/lib/ai/portfolio-data"
import { parseArgs } from "@web/lib/ai/tool-args"

/** A market tool never holds the answer up past this: a slow provider becomes a plain "unavailable", not a hung reply. */
const withTimeout = <T,>(work: Promise<T>, ms = 8_000): Promise<T | { reason: string }> =>
  Promise.race([work, new Promise<{ reason: string }>((resolve) => setTimeout(() => resolve({ reason: "That data is slow to load right now." }), ms))])


/** Market tools: public data only, no user ids, so nothing here can reach anyone's accounts. */

const MAX_SYMBOLS = 8

/** Tickers as typed: upper-cased, deduplicated, and only shapes that can be a US ticker. */
export function parseSymbols(args: Record<string, unknown>): string[] {
  const raw = Array.isArray(args.symbols) ? args.symbols : []
  const clean = raw.flatMap((s) => (typeof s === "string" ? [s.trim().toUpperCase().replace(/[-/]/g, ".")] : []))
  return [...new Set(clean.filter((s) => /^[A-Z][A-Z0-9]{0,5}(\.[A-Z0-9]{1,2})?$/.test(s)))].slice(0, MAX_SYMBOLS)
}

export const runMarketSnapshot = () => withTimeout(marketSnapshot())
async function marketSnapshot(): Promise<unknown> {
  const [b, fg] = await Promise.all([board(), fearGreed(nyDate(new Date()))])
  if (!b) return { reason: "Market quotes aren't available right now." }
  return {
    session: b.session,
    asOf: b.asOf,
    note: "Index moves come from the funds that track them (SPY, QQQ, DIA, IWM). Percent figures are for the session dated above.",
    indexes: b.indexes.map((i) => ({ name: i.name, fund: i.symbol, price: i.price, dayPercent: i.day.percent, weekPercent: i.week?.percent ?? null })),
    sectorsByDayPercent: b.sectors.map(([name, day, week]) => ({ name, dayPercent: day, weekPercent: week })),
    fearGreed: fg ? { score: fg.score, rating: fg.rating, asOf: fg.asOf } : null,
  }
}

export const runGetQuotes = (rawArgs: string) => withTimeout(getQuotes(rawArgs)).catch(() => ({ reason: "Quotes aren't available right now." }))
async function getQuotes(rawArgs: string): Promise<unknown> {
  const symbols = parseSymbols(parseArgs(rawArgs))
  if (symbols.length === 0) return { error: "Give 1-8 ticker symbols." }
  const quotes = new Map(await quotesFor([...symbols].sort().join(",")).catch(() => []))
  return {
    quotes: symbols.flatMap((s) => {
      const q = quotes.get(s)
      return q ? [{ symbol: s, price: q.c, changePercent: q.dp, changeDollars: q.d, previousClose: q.pc, asOf: new Date(q.t * 1000).toISOString() }] : []
    }),
    unavailable: symbols.filter((s) => !quotes.has(s)),
  }
}

const heldTickers = async (userId: string) => new Set((await loadPositions(userId)).filter((p) => p.value > 0 && p.ticker).map((p) => p.ticker!.toUpperCase()))

export const runTopMovers = (rawArgs: string, userId: string) => withTimeout(topMovers(rawArgs, userId)).catch(() => ({ reason: "Market-wide movers aren't available right now." }))
async function topMovers(rawArgs: string, userId: string): Promise<unknown> {
  const args = parseArgs(rawArgs)
  const direction = args.direction === "gainers" || args.direction === "losers" ? args.direction : "both"
  const limit = typeof args.limit === "number" && Number.isFinite(args.limit) ? Math.min(10, Math.max(1, Math.trunc(args.limit))) : 5
  const [result, held] = await Promise.all([movers(nyDate(new Date())).catch(() => null), heldTickers(userId)])
  if (!result) return { reason: "Market-wide movers aren't available right now." }
  const row = (m: { symbol: string; price: number; changePercent: number }) => ({ symbol: m.symbol, price: m.price, changePercent: m.changePercent, youHoldThis: held.has(m.symbol) })
  const all = result.movers
  return {
    universe: `${all.length} of the largest, most-traded US stocks (a Peerfolio list, not an official index). Not the whole market.`,
    asOf: result.asOf,
    note: "Prices come from the IEX feed, so the very latest trade can differ slightly.",
    ...(direction !== "losers" ? { topGainers: all.filter((m) => m.changePercent > 0).slice(0, limit).map(row) } : {}),
    ...(direction !== "gainers" ? { topLosers: all.filter((m) => m.changePercent < 0).slice(-limit).reverse().map(row) } : {}),
  }
}

export const runEarnings = (rawArgs: string, userId: string) => withTimeout(earningsCalendar(rawArgs, userId))
async function earningsCalendar(rawArgs: string, userId: string): Promise<unknown> {
  const args = parseArgs(rawArgs)
  const scope = args.scope === "today" || args.scope === "my_holdings_week" ? args.scope : "week"
  const now = new Date()
  const [data, held] = await Promise.all([earnings(earningsWeekDates(now)[0]!), heldTickers(userId)])
  if (!data) return { reason: "The earnings calendar isn't available right now." }
  const today = nyDate(now)
  const shape = (r: { symbol: string; name: string; when: string; epsEstimate: string }) => ({ symbol: r.symbol, name: r.name || undefined, when: r.when, epsEstimate: r.epsEstimate, youHoldThis: held.has(r.symbol) })
  const days = data.days
    .filter((d) => scope !== "today" || d.iso === today)
    .map((d) => {
      const reports = scope === "my_holdings_week" ? d.reports.filter((r) => held.has(r.symbol)) : d.reports.slice(0, scope === "today" ? 15 : 8)
      return { date: d.iso, day: d.dow, reports: reports.map(shape) }
    })
    .filter((d) => d.reports.length > 0)
  return {
    week: data.label,
    asOf: data.asOf,
    note: "Largest companies by expected revenue first. Dates and timing (before open / after close) are the calendar's, and can change.",
    ...(scope === "today" && days.length === 0 ? { reason: "No notable earnings reports today (or the market is closed)." } : {}),
    days,
  }
}
