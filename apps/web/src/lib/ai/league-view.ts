/**
 * What the assistant may know about a league: what a member already sees on the
 * league page, and nothing more. Built by choosing fields (an allow-list), never
 * by removing them, so a field added to standings later stays hidden until
 * someone adds it here on purpose. No user ids, images, invite codes, balances
 * or reactions; other members' holdings only when they chose to share them.
 */

export type StandingLike = {
  userId: string
  name: string | null
  handle: string | null
  rank: number
  percent: number
  days: number
  hasHistory: boolean
  isYou: boolean
  shareHoldings: boolean
  holdings: { ticker: string; name: string | null; weight: number }[]
}

export type LeagueView = {
  members: number
  /** Members with enough history to be ranked. */
  ranked: number
  you: { rank: number | null; returnPercent: number | null; gapToLeaderPoints: number | null } | null
  standings: {
    rank: number | null
    member: string
    isYou: boolean
    returnPercent: number | null
    daysTracked: number
    /** Only present when that member shares holdings with the league. */
    sharedHoldings?: { ticker: string; weightPercent: number }[]
  }[]
}

const round = (v: number, places = 2) => Math.round(v * 10 ** places) / 10 ** places

export function shapeStandings(rows: StandingLike[]): LeagueView {
  const ranked = rows.filter((r) => r.hasHistory).sort((a, b) => a.rank - b.rank)
  const leader = ranked[0]
  const me = rows.find((r) => r.isYou)

  const standings = [...rows]
    .sort((a, b) => (a.hasHistory === b.hasHistory ? a.rank - b.rank : a.hasHistory ? -1 : 1))
    .map((r) => ({
      rank: r.hasHistory ? r.rank : null,
      member: r.isYou ? "You" : (r.name ?? r.handle ?? "A member"),
      isYou: r.isYou,
      returnPercent: r.hasHistory ? round(r.percent) : null,
      daysTracked: r.days,
      ...(r.shareHoldings && r.holdings.length > 0 ? { sharedHoldings: r.holdings.map((h) => ({ ticker: h.ticker, weightPercent: round(h.weight, 1) })) } : {}),
    }))

  return {
    members: rows.length,
    ranked: ranked.length,
    you: me
      ? {
          rank: me.hasHistory ? me.rank : null,
          returnPercent: me.hasHistory ? round(me.percent) : null,
          gapToLeaderPoints: me.hasHistory && leader ? round(me.percent - leader.percent) : null,
        }
      : null,
    standings,
  }
}
