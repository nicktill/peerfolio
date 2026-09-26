import type { Standing } from "@web/components/leagues/standing-row"

/**
 * Illustrative members for the landing page, rendered through the real league
 * components. Deterministic so server and client render the same markup.
 */
function series(seed: number, drift: number, volatility: number, days = 30): number[] {
  let state = seed
  const random = () => ((state = (state * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  const points = [100]
  for (let i = 1; i < days; i++) {
    points.push(points[i - 1]! * (1 + drift + (random() - 0.5) * volatility))
  }
  return points.map((p) => Math.round(p * 100) / 100)
}

const MEMBERS = [
  { name: "Maya Chen", handle: "maya", seed: 7, drift: 0.0022, vol: 0.02, holdings: [["NVDA", 38], ["MSFT", 22], ["AAPL", 15]], reactions: { "🔥": 3, "🚀": 1 } },
  { name: "Alex Rivera", handle: "alex", seed: 3, drift: 0.0028, vol: 0.012, holdings: [["VTI", 52], ["VXUS", 20], ["AAPL", 9]], reactions: { "👏": 2 }, isYou: true },
  { name: "Sam Okafor", handle: "sam", seed: 11, drift: 0.0008, vol: 0.009, holdings: [["VTI", 50], ["VXUS", 29], ["MSFT", 19]], reactions: {} },
  { name: "Priya Raman", handle: "priya", seed: 5, drift: -0.0012, vol: 0.03, holdings: [], reactions: { "😤": 2 } },
  { name: "DeShawn Ellis", handle: "deshawn", seed: 13, drift: -0.0009, vol: 0.006, holdings: [["VTI", 67], ["BND", 33]], reactions: { "🧊": 1 } },
] as const

export const DEMO_STANDINGS: Standing[] = MEMBERS.map((m) => {
  const spark = series(m.seed, m.drift, m.vol)
  return {
    userId: m.handle,
    name: m.name,
    handle: m.handle,
    image: null,
    rank: 0,
    percent: spark[spark.length - 1]! - 100,
    days: spark.length,
    spark,
    hasHistory: true,
    shareHoldings: m.holdings.length > 0,
    isVerified: true,
    holdings: m.holdings.map(([ticker, weight]) => ({ ticker, name: null, weight })),
    reactions: m.reactions,
    isYou: "isYou" in m,
  }
})
  .sort((a, b) => b.percent - a.percent)
  .map((s, i) => ({ ...s, rank: i + 1 }))
