/**
 * What the assistant may know about a fantasy league: what members already see on
 * the league page. An allow-list, as with the real leagues: no user ids, images,
 * invite codes or reactions. Picks are always visible to the league in this game,
 * so top positions are included for everyone.
 */

export type FantasyStandingLike = {
  name: string | null
  handle: string | null
  rank: number
  percent: number
  isYou: boolean
  value: number
  holdings: { ticker: string; weight: number }[]
}

export type FantasyLeagueLike = {
  league: { name: string; startingCash: number; maxPositionPct: number | null; endsAt: Date | string | null; isClosed: boolean }
  standings: FantasyStandingLike[]
  you: {
    cash: number
    value: number
    percent: number
    rank: number
    positions: { ticker: string; shares: number; value: number; [k: string]: unknown }[]
    orders: { status: string }[]
  }
  feed: { name: string | null; handle: string | null; side: "buy" | "sell"; ticker: string; shares: number; price: number; at: string }[]
}

const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places

export function shapeFantasy(data: FantasyLeagueLike, now = new Date()) {
  const total = data.you.positions.reduce((s, p) => s + p.value, 0) || 0
  const leader = [...data.standings].sort((a, b) => a.rank - b.rank)[0]
  return {
    league: {
      name: data.league.name,
      startingCash: data.league.startingCash,
      maxPositionPercent: data.league.maxPositionPct,
      endsAt: data.league.endsAt ? new Date(data.league.endsAt).toISOString().slice(0, 10) : null,
      closed: data.league.isClosed,
    },
    /** Prices are the last stored ones; this view never requests fresh quotes. */
    pricesNote: "Based on stored prices, not live quotes.",
    you: {
      rank: data.you.rank,
      returnPercent: round(data.you.percent),
      gapToLeaderPoints: leader ? round(data.you.percent - leader.percent) : null,
      value: round(data.you.value),
      cash: round(data.you.cash),
      pendingOrders: data.you.orders.filter((o) => o.status === "pending").length,
      positions: data.you.positions.slice(0, 10).map((p) => ({ ticker: p.ticker, shares: round(p.shares, 4), weightPercent: total > 0 ? round((p.value / total) * 100, 1) : 0 })),
    },
    standings: [...data.standings]
      .sort((a, b) => a.rank - b.rank)
      .map((s) => ({
        rank: s.rank,
        member: s.isYou ? "You" : (s.name ?? s.handle ?? "A member"),
        isYou: s.isYou,
        returnPercent: round(s.percent),
        topHoldings: s.holdings.slice(0, 5).map((h) => ({ ticker: h.ticker, weightPercent: round(h.weight, 1) })),
      })),
    recentTrades: data.feed.slice(0, 10).map((f) => ({
      member: f.name ?? f.handle ?? "A member",
      side: f.side,
      ticker: f.ticker,
      shares: round(f.shares, 4),
      price: round(f.price),
      at: f.at,
    })),
    asOf: now.toISOString(),
  }
}
