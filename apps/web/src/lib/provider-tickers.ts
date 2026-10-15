import "server-only"
import { gte, sql } from "drizzle-orm"
import { db, providerRequestEvents } from "@web/db"
import { REFRESH_SECONDS } from "@web/lib/live-quotes"
import { displaySymbol } from "@web/lib/market-data"
import { isUsMarketOpen } from "@web/lib/market-hours"
import {
  describeTicker,
  issuesByTicker,
  nextSessionOpen,
  type TickerEvent,
  type TickerRow,
  type TickersResponse,
} from "@web/lib/ticker-freshness-core"

const ISSUE_WINDOW_HOURS = 24
const EVENT_SCAN_LIMIT = 4000

type HeldRow = {
  id: string
  market_ticker: string | null
  ticker_symbol: string | null
  name: string | null
  type: string | null
  close_price: string | null
  as_of: string | null
  final: boolean
  priced_at: Date | string | null
  updated_at: Date | string
  holders: number
  fantasy_holders: number
}

const toDate = (v: Date | string) => (v instanceof Date ? v : new Date(v))

/**
 * Every security someone holds today, with how fresh its price is and what is
 * expected to happen next (`describeTicker`), plus the provider problems logged
 * for it in the last day. A holding in an archived account doesn't count as held.
 */
export async function providerTickers(now = new Date()): Promise<TickersResponse> {
  const held = [
    ...(await db.execute<HeldRow>(sql`
      SELECT s.id, s.market_ticker, s.ticker_symbol, s.name, s.type, s.close_price,
        s.close_price_as_of::text AS as_of, s.close_price_final AS final, s.priced_at, s.updated_at,
        (SELECT count(DISTINCT h.user_id)::int FROM holdings h JOIN accounts a ON a.id = h.account_id
           WHERE h.security_id = s.id AND a.is_active) AS holders,
        (SELECT count(*)::int FROM fantasy_positions f WHERE f.security_id = s.id) AS fantasy_holders
      FROM securities s
      WHERE EXISTS (SELECT 1 FROM holdings h JOIN accounts a ON a.id = h.account_id WHERE h.security_id = s.id AND a.is_active)
         OR EXISTS (SELECT 1 FROM fantasy_positions f WHERE f.security_id = s.id)`)),
  ]

  const since = new Date(now.getTime() - ISSUE_WINDOW_HOURS * 3_600_000)
  const eventRows = await db
    .select()
    .from(providerRequestEvents)
    .where(gte(providerRequestEvents.at, since))
    .orderBy(sql`${providerRequestEvents.at} DESC`)
    .limit(EVENT_SCAN_LIMIT)
  const events: TickerEvent[] = eventRows
    .filter((e) => e.symbolsSample)
    .map((e) => ({ at: e.at.toISOString(), provider: e.provider, kind: e.kind, reason: e.reason, symbols: e.symbolsSample.split(",") }))
  const issues = issuesByTicker(events, new Set(held.flatMap((h) => (h.market_ticker ? [h.market_ticker] : []))))

  const tickers = held.map((h): TickerRow => {
    const state = describeTicker(
      {
        marketTicker: h.market_ticker,
        type: h.type,
        asOf: h.as_of ? h.as_of.slice(0, 10) : null,
        final: h.final,
        pricedAt: h.priced_at ? toDate(h.priced_at) : null,
        updatedAt: toDate(h.updated_at),
      },
      now,
      REFRESH_SECONDS,
    )
    return {
      id: h.id,
      symbol: h.market_ticker ? displaySymbol(h.market_ticker) : (h.ticker_symbol ?? h.id),
      marketTicker: h.market_ticker,
      name: h.name,
      type: h.type,
      price: h.close_price == null ? null : Number(h.close_price),
      asOf: h.as_of ? h.as_of.slice(0, 10) : null,
      final: h.final,
      pricedAt: h.priced_at ? toDate(h.priced_at).toISOString() : null,
      holders: Number(h.holders),
      fantasyHolders: Number(h.fantasy_holders),
      state,
      issues: h.market_ticker ? (issues.get(h.market_ticker) ?? null) : null,
    }
  })

  const open = nextSessionOpen(now)
  return { now: now.toISOString(), refreshSeconds: REFRESH_SECONDS, marketOpen: isUsMarketOpen(now), nextOpen: open ? open.toISOString() : null, tickers }
}
