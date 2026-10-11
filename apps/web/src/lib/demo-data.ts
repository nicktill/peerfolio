// Shared by `scripts/seed.ts` and the preview login bootstrap. Pure data: no imports, so a plain Node script can load it.

/** Deterministic PRNG, so re-seeding produces the same portfolios every time. */
export function makeRandom(seed: number) {
  let state = seed
  return () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
}

export const DEMO_PEOPLE = [
  { handle: "theo", name: "Theo Marsh", drift: 0.0016, volatility: 0.01, bio: "Index funds and patience." },
  { handle: "maya", name: "Maya Chen", drift: 0.0024, volatility: 0.014, bio: "Concentrated in what I understand." },
  { handle: "deshawn", name: "DeShawn Ellis", drift: 0.0009, volatility: 0.006, bio: "Boring on purpose." },
  { handle: "priya", name: "Priya Raman", drift: 0.0031, volatility: 0.021, bio: "High conviction, high variance." },
  { handle: "sam", name: "Sam Okafor", drift: 0.0019, volatility: 0.009, bio: "Three funds and a nap." },
]

export const SECURITIES = [
  { id: "demo-vti", tickerSymbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf" },
  { id: "demo-vxus", tickerSymbol: "VXUS", name: "Vanguard Total International Stock ETF", type: "etf" },
  { id: "demo-bnd", tickerSymbol: "BND", name: "Vanguard Total Bond Market ETF", type: "fixed_income" },
  { id: "demo-nvda", tickerSymbol: "NVDA", name: "NVIDIA Corporation", type: "equity" },
  { id: "demo-aapl", tickerSymbol: "AAPL", name: "Apple Inc.", type: "equity" },
  { id: "demo-msft", tickerSymbol: "MSFT", name: "Microsoft Corporation", type: "equity" },
]

export const MIXES: Record<string, [string, number][]> = {
  theo: [["demo-vti", 21400], ["demo-vxus", 8200], ["demo-bnd", 5100], ["demo-nvda", 4300], ["demo-aapl", 2600]],
  maya: [["demo-nvda", 19800], ["demo-msft", 11200], ["demo-aapl", 7400], ["demo-vti", 5100]],
  deshawn: [["demo-vti", 28000], ["demo-bnd", 14000]],
  priya: [["demo-nvda", 26500], ["demo-aapl", 9100], ["demo-msft", 4200]],
  sam: [["demo-vti", 16000], ["demo-vxus", 9400], ["demo-msft", 6100]],
}

export const DAYS = 120

export type DemoFantasyPlayer = { handle: string; returnPct: number; cash: number; picks: [string, number][] }

/**
 * A demo fantasy league. `endsInDays` is how far off the end is: positive is still running, negative
 * means it ended that many days ago, null never ends. `daysIn` is how many days of history it has.
 */
export type DemoFantasyLeague = {
  inviteCode: string
  name: string
  emoji: string
  accent: string
  owner: string
  seed: number
  daysIn: number
  endsInDays: number | null
  players: DemoFantasyPlayer[]
}

export const FANTASY_START = 100_000

/** Where each player stands in each demo league, on a $100,000 start. Theo (the signed-in demo user) sits third in all of them. */
export const DEMO_FANTASY_LEAGUES: DemoFantasyLeague[] = [
  {
    inviteCode: "DEMO2345", name: "Friday Draft", emoji: "🏈", accent: "emerald", owner: "maya", seed: 7, daysIn: 45, endsInDays: 59,
    players: [
      { handle: "maya", returnPct: 8.95, cash: 11500, picks: [["demo-nvda", 0.5], ["demo-msft", 0.3], ["demo-aapl", 0.2]] },
      { handle: "priya", returnPct: 5.28, cash: 6000, picks: [["demo-nvda", 0.65], ["demo-aapl", 0.35]] },
      { handle: "theo", returnPct: 2.64, cash: 22000, picks: [["demo-vti", 0.55], ["demo-vxus", 0.25], ["demo-nvda", 0.2]] },
      { handle: "deshawn", returnPct: 1.52, cash: 31000, picks: [["demo-vti", 0.6], ["demo-bnd", 0.4]] },
      { handle: "sam", returnPct: 0.97, cash: 9000, picks: [["demo-vti", 0.5], ["demo-vxus", 0.3], ["demo-msft", 0.2]] },
    ],
  },
  {
    inviteCode: "DEMO4567", name: "Summer Draft", emoji: "🏖️", accent: "amber", owner: "deshawn", seed: 19, daysIn: 60, endsInDays: -4,
    players: [
      { handle: "priya", returnPct: 12.4, cash: 8000, picks: [["demo-nvda", 0.7], ["demo-msft", 0.3]] },
      { handle: "deshawn", returnPct: 6.1, cash: 26000, picks: [["demo-vti", 0.7], ["demo-bnd", 0.3]] },
      { handle: "theo", returnPct: 4.8, cash: 18000, picks: [["demo-vti", 0.5], ["demo-aapl", 0.3], ["demo-vxus", 0.2]] },
      { handle: "maya", returnPct: 1.9, cash: 5000, picks: [["demo-aapl", 0.6], ["demo-msft", 0.4]] },
      { handle: "sam", returnPct: -2.3, cash: 14000, picks: [["demo-vxus", 0.6], ["demo-nvda", 0.4]] },
    ],
  },
  {
    inviteCode: "DEMO5678", name: "The Long Game", emoji: "♾️", accent: "violet", owner: "sam", seed: 31, daysIn: 30, endsInDays: null,
    players: [
      { handle: "sam", returnPct: 4.2, cash: 12000, picks: [["demo-vti", 0.5], ["demo-msft", 0.5]] },
      { handle: "maya", returnPct: 3.5, cash: 7000, picks: [["demo-nvda", 0.55], ["demo-aapl", 0.45]] },
      { handle: "theo", returnPct: 2.1, cash: 20000, picks: [["demo-vti", 0.6], ["demo-vxus", 0.4]] },
      { handle: "priya", returnPct: 0.4, cash: 4000, picks: [["demo-nvda", 0.8], ["demo-aapl", 0.2]] },
      { handle: "deshawn", returnPct: -1.1, cash: 28000, picks: [["demo-bnd", 0.6], ["demo-vti", 0.4]] },
    ],
  },
]

/** How many days ago the first and last snapshots fall. A running league's last is yesterday; a finished one's is its end date. */
export function fantasyDayRange(league: DemoFantasyLeague) {
  const lastDay = league.endsInDays !== null && league.endsInDays < 0 ? -league.endsInDays : 1
  return { firstDay: lastDay + league.daysIn - 1, lastDay }
}

export function fantasyEndsAt(league: DemoFantasyLeague, now = new Date()): Date | null {
  return league.endsInDays === null ? null : new Date(now.getTime() + league.endsInDays * 86_400_000)
}

/** A path that wanders and lands exactly on the target, so the race chart has a story and a finished league scores what it shows. */
export function fantasyHistory(league: DemoFantasyLeague, finalValue: number, random: () => number): { daysAgo: number; value: number }[] {
  const { firstDay, lastDay } = fantasyDayRange(league)
  const span = Math.max(1, firstDay - lastDay)
  const out = []
  for (let daysAgo = firstDay; daysAgo >= lastDay; daysAgo--) {
    const progress = (firstDay - daysAgo) / span
    const wobble = daysAgo === lastDay ? 0 : (random() - 0.5) * 0.012 * FANTASY_START * (1 - progress * 0.6)
    out.push({ daysAgo, value: FANTASY_START + (finalValue - FANTASY_START) * Math.pow(progress, 1.15) + wobble })
  }
  return out
}

/** What one league looks like in the database, boiled down to counts. */
export type FantasyLeagueRow = { inviteCode: string; endsAt: Date | null; members: number; positions: number; trades: number; snapshots: number; mine: boolean }

/**
 * Whether the demo fantasy leagues are all there and whole for this user: every league exists, the
 * user has a seat, each has its members, positions, trades and history, and the end dates still mean
 * what the league is for (a running one hasn't lapsed, a finished one hasn't been reopened).
 */
export function fantasyIsComplete(rows: FantasyLeagueRow[], now = new Date(), extraSeat = false): boolean {
  return DEMO_FANTASY_LEAGUES.every((league) => {
    const row = rows.find((r) => r.inviteCode === league.inviteCode)
    if (!row || !row.mine) return false
    const picks = league.players.reduce((sum, p) => sum + p.picks.length, 0)
    if (row.members < league.players.length + (extraSeat ? 1 : 0) || row.positions < picks || row.trades < picks) return false
    if (row.snapshots < league.players.length * league.daysIn) return false
    if (league.endsInDays === null) return row.endsAt === null
    if (league.endsInDays < 0) return row.endsAt !== null && row.endsAt.getTime() <= now.getTime()
    return row.endsAt !== null && row.endsAt.getTime() > now.getTime() + 7 * 86_400_000
  })
}
