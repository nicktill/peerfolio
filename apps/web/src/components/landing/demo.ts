/**
 * The sample league shown on the landing page. Five friends with a deliberate
 * profile each, used the same way in every preview so the page reads as one story.
 * Deterministic, so server and client render the same markup.
 */
export type Member = {
  id: string
  name: string
  /** The one-liner this person is known for in the chat. */
  note: string
  /** Line + avatar colour, from the chart palette (never a gain/loss hue). */
  color: string
  look: 0 | 1 | 2 | 3 | 4
  isYou?: boolean
  holdings: { ticker: string; weight: number }[]
  reactions: { emoji: string; count: number }[]
  percent: number
  points: number[]
}

function path(seed: number, target: number, vol: number, days = 30): number[] {
  let state = seed
  const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const raw = [0]
  for (let i = 1; i < days; i++) raw.push(raw[i - 1]! + (random() - 0.5) * vol + target / days)
  const end = raw[days - 1]!
  // Pin the last day to the stated return so the table and the chart agree.
  return raw.map((v, i) => Math.round((100 + v + ((target - end) * i) / (days - 1)) * 100) / 100)
}

const BASE = [
  { id: "theo", name: "Theo", note: "NVDA is a personality at this point.", color: "var(--series-1)", look: 0, holdings: [{ ticker: "NVDA", weight: 46 }, { ticker: "AMD", weight: 18 }, { ticker: "TSM", weight: 14 }], reactions: [{ emoji: "🔥", count: 3 }], percent: 14.2, seed: 7, vol: 2.4 },
  { id: "sam", name: "Sam", note: "Rebalances on Sundays.", color: "var(--series-4)", look: 1, isYou: true, holdings: [{ ticker: "VOO", weight: 44 }, { ticker: "MSFT", weight: 21 }, { ticker: "AAPL", weight: 15 }], reactions: [{ emoji: "👏", count: 2 }], percent: 8.9, seed: 3, vol: 1.3 },
  { id: "priya", name: "Priya", note: "Index funds. See you in 2050.", color: "var(--series-5)", look: 2, holdings: [{ ticker: "VTI", weight: 58 }, { ticker: "VXUS", weight: 24 }, { ticker: "BND", weight: 18 }], reactions: [{ emoji: "🧊", count: 1 }], percent: 6.8, seed: 11, vol: 0.7 },
  { id: "maya", name: "Maya", note: "Only buys what pays a dividend.", color: "var(--series-7)", look: 3, holdings: [{ ticker: "SCHD", weight: 41 }, { ticker: "O", weight: 22 }, { ticker: "KO", weight: 14 }], reactions: [], percent: 3.1, seed: 5, vol: 0.9 },
  { id: "dev", name: "Dev", note: "Down and, somehow, thriving.", color: "var(--series-2)", look: 4, holdings: [{ ticker: "PLTR", weight: 34 }, { ticker: "COIN", weight: 22 }, { ticker: "SOFI", weight: 17 }], reactions: [{ emoji: "🤝", count: 2 }], percent: -4.6, seed: 13, vol: 3.0 },
] as const

export const CAST: Member[] = BASE.map((m) => ({
  id: m.id,
  name: m.name,
  note: m.note,
  color: m.color,
  look: m.look,
  isYou: "isYou" in m,
  holdings: [...m.holdings],
  reactions: [...m.reactions],
  percent: m.percent,
  points: path(m.seed, m.percent, m.vol),
}))
