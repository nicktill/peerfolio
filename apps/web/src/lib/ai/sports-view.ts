/**
 * What the assistant may know about a Sports league: what a member already sees on the league page, shaped small.
 * An allow-list (fields are chosen, never removed): no user ids, images or invite codes. The viewer's own picks are
 * included; other members' picks only once locked (kickoff), never an open one. Parlays may not exist in the data yet,
 * so everything about them is optional and read defensively. Cash is virtual; credits in the data are the app's "cash".
 */

type PickLike = {
  selection?: unknown
  stake?: unknown
  price?: unknown
  point?: unknown
  totalReturn?: unknown
  payout?: unknown
  status?: unknown
  live?: unknown
  name?: unknown
  you?: unknown
  market?: { kind?: unknown; player?: unknown; statKey?: unknown } | null
  event?: { sport?: unknown; home?: unknown; away?: unknown; startsAt?: unknown } | null
}

type ParlayLike = PickLike & { legs?: PickLike[] | null }

export type SportsLeagueLike = {
  league?: { name?: string; sports?: string[]; startingCredits?: number; maxStakePct?: number; liveBetting?: boolean; endsAt?: string | null }
  you?: { credits?: number }
  limits?: { minStake?: number; maxStake?: number; maxOpenPicks?: number; parlay?: { minLegs?: number; maxLegs?: number; minStake?: number; maxStake?: number } }
  standings?: { name?: string | null; record?: { won?: number; lost?: number }; credits?: number; isYou?: boolean }[]
  markets?: { kind?: string; player?: string | null; lockAt?: string; event?: { sport?: string; home?: string; away?: string; startsAt?: string }; lines?: { selection?: string; price?: number; point?: number | null }[] }[]
  picks?: PickLike[]
  leaguePicks?: PickLike[]
  parlays?: ParlayLike[]
  leagueParlays?: ParlayLike[]
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null)
const text = (v: unknown, max = 40): string | null => (typeof v === "string" && v.trim() ? v.replace(/[\u0000-\u001f\u007f<>`]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : null)
const time = (v: unknown): number => (typeof v === "string" ? Date.parse(v) : NaN)

function shapePick(p: PickLike, withName: boolean) {
  const e = p.event ?? {}
  const m = p.market ?? {}
  return {
    ...(withName ? { member: text(p.name) ?? "A member" } : {}),
    sport: text(e.sport, 12),
    game: `${text(e.away, 30) ?? "?"} at ${text(e.home, 30) ?? "?"}`,
    startsAt: text(e.startsAt, 30),
    type: text(m.kind, 16),
    player: text(m.player, 40),
    stat: text(m.statKey, 30),
    selection: text(p.selection, 12),
    point: num(p.point),
    stake: num(p.stake),
    americanOdds: num(p.price),
    totalReturnIfWin: num(p.totalReturn),
    status: text(p.status, 12),
    payout: num(p.payout),
    live: p.live === true ? true : undefined,
  }
}

/** Others' parlays are visible only when settled or every leg has kicked off; an open parlay with an unstarted leg stays private. */
function parlayVisibleToOthers(p: ParlayLike, nowMs: number): boolean {
  if (p.status && p.status !== "open") return true
  const legs = p.legs ?? []
  return legs.length > 0 && legs.every((l) => time(l.event?.startsAt) <= nowMs)
}

function shapeParlay(p: ParlayLike, withName: boolean) {
  return {
    ...(withName ? { member: text(p.name) ?? "A member" } : {}),
    stake: num(p.stake),
    combinedAmericanOdds: num(p.price),
    totalReturnIfWin: num(p.totalReturn),
    status: text(p.status, 12),
    payout: num(p.payout),
    legs: (p.legs ?? []).slice(0, 8).map((l) => ({ game: `${text(l.event?.away, 30) ?? "?"} at ${text(l.event?.home, 30) ?? "?"}`, selection: text(l.selection, 12), point: num(l.point), americanOdds: num(l.price), status: text(l.status, 8) })),
  }
}

export function shapeSports(data: SportsLeagueLike, now = new Date()) {
  const nowMs = now.getTime()
  const league = data.league ?? {}
  const start = league.startingCredits ?? 0
  const cash = data.you?.credits ?? 0
  const picks = Array.isArray(data.picks) ? data.picks : []
  const parlays = Array.isArray(data.parlays) ? data.parlays : []
  const openSingles = picks.filter((p) => p.status === "open")
  const openParlays = parlays.filter((p) => p.status === "open")
  const atRisk = [...openSingles, ...openParlays].reduce((s, p) => s + (num(p.stake) ?? 0), 0)
  const standings = Array.isArray(data.standings) ? data.standings : []
  const ranked = [...standings].sort((a, b) => (b.credits ?? 0) - (a.credits ?? 0))
  const myRank = ranked.findIndex((s) => s.isYou) + 1
  const leader = ranked[0]

  const markets = Array.isArray(data.markets) ? data.markets : []
  const sorted = [...markets].sort((a, b) => time(a.event?.startsAt) - time(b.event?.startsAt))
  const games = new Map<string, { sport: string | null; game: string; startsAt: string | null; markets: number }>()
  for (const m of sorted) {
    const key = `${m.event?.away}|${m.event?.home}|${m.event?.startsAt}`
    const g = games.get(key)
    if (g) g.markets++
    else games.set(key, { sport: text(m.event?.sport, 12), game: `${text(m.event?.away, 30) ?? "?"} at ${text(m.event?.home, 30) ?? "?"}`, startsAt: text(m.event?.startsAt, 30), markets: 1 })
  }
  const moneylines = sorted.filter((m) => m.kind === "moneyline").slice(0, 6).map((m) => ({ game: `${text(m.event?.away, 30) ?? "?"} at ${text(m.event?.home, 30) ?? "?"}`, startsAt: text(m.event?.startsAt, 30), lines: (m.lines ?? []).map((l) => ({ side: text(l.selection, 8), americanOdds: num(l.price) })) }))

  // The viewer's own picks (open ones first) and the locked picks of other members.
  const mine = [...picks].sort((a, b) => Number(b.status === "open") - Number(a.status === "open")).slice(0, 12)
  const others = (Array.isArray(data.leaguePicks) ? data.leaguePicks : [])
    .filter((p) => p.you !== true)
    // Defence in depth: the query already lists only locked markets; an open pick on a game that hasn't started is never passed on.
    .filter((p) => p.status !== "open" || time(p.event?.startsAt) <= nowMs)
    .slice(0, 10)
  const otherParlays = (Array.isArray(data.leagueParlays) ? data.leagueParlays : []).filter((p) => p.you !== true && parlayVisibleToOthers(p, nowMs)).slice(0, 5)
  const record = (s: { won?: number; lost?: number } | undefined) => `${s?.won ?? 0}-${s?.lost ?? 0}`

  return {
    league: {
      name: text(league.name, 60),
      sports: (league.sports ?? []).slice(0, 12),
      startingCash: start,
      maxSinglePick: data.limits?.maxStake ?? null,
      maxSinglePickPercentOfStartingCash: league.maxStakePct ?? null,
      minPick: data.limits?.minStake ?? null,
      maxOpenPicks: data.limits?.maxOpenPicks ?? null,
      livePicksAllowed: league.liveBetting ?? null,
      endsAt: league.endsAt ? String(league.endsAt).slice(0, 10) : null,
      members: standings.length,
      ...(data.limits?.parlay ? { parlayLimits: data.limits.parlay } : {}),
    },
    you: {
      rank: myRank || null,
      cash,
      atRisk,
      totalValue: cash + atRisk,
      gainSinceStart: cash + atRisk - start,
      record: record(standings.find((s) => s.isYou)?.record),
      gapToLeader: leader && myRank ? (ranked[myRank - 1]!.credits ?? 0) - (leader.credits ?? 0) : null,
      openPicks: openSingles.length,
      openParlays: openParlays.length,
    },
    standingsNote: "Total = cash + stake still at risk. Top five and you.",
    standings: ranked.map((s, i) => ({ rank: i + 1, member: s.isYou ? "You" : (text(s.name) ?? "A member"), total: s.credits ?? 0, record: record(s.record), isYou: !!s.isYou })).filter((r) => r.rank <= 5 || r.isYou),
    openLines: { games: games.size, markets: markets.length, nextGames: [...games.values()].slice(0, 6), moneylines },
    yourPicks: mine.map((p) => shapePick(p, false)),
    yourParlays: parlays.slice(0, 5).map((p) => shapeParlay(p, false)),
    othersLockedPicks: others.map((p) => shapePick(p, true)),
    othersParlays: otherParlays.map((p) => shapeParlay(p, true)),
    note: "Other members' picks appear only after kickoff. Odds are American. Play money only.",
    asOf: now.toISOString(),
  }
}
