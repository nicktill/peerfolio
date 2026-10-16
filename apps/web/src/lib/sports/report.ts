/**
 * Mirrored-pick report for league owners. Two accounts that keep taking
 * opposite sides of the same market are the signature of one person moving
 * credits to a main account. Pure; the store feeds it only picks on markets
 * that are already locked, so it never reveals open picks.
 */

export type PickLite = { memberId: string; marketId: string; selection: string }

export type MirroredPair = { a: string; b: string; markets: number }

export function mirroredPairs(picks: PickLite[], minShared = 3): MirroredPair[] {
  const byMarket = new Map<string, PickLite[]>()
  for (const p of picks) byMarket.set(p.marketId, [...(byMarket.get(p.marketId) ?? []), p])
  const counts = new Map<string, MirroredPair>()
  for (const group of byMarket.values()) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const [x, y] = [group[i]!, group[j]!]
        if (x.memberId === y.memberId || x.selection === y.selection) continue
        const [a, b] = x.memberId < y.memberId ? [x.memberId, y.memberId] : [y.memberId, x.memberId]
        const key = `${a}|${b}`
        const cur = counts.get(key) ?? { a, b, markets: 0 }
        cur.markets++
        counts.set(key, cur)
      }
    }
  }
  return [...counts.values()].filter((p) => p.markets >= minShared).sort((p, q) => q.markets - p.markets)
}
