import { decimalToAmerican } from './parlay-math.ts'

type Fill = {
  id: string; selection: string; stake: number; price: number; point: number | null; totalReturn: number; status: string
  market: { kind: string; player: string | null; statKey: string | null }
  event: { id?: string }
}

/** Personal-feed presentation only. Never combines stored picks or their settlement/cashout IDs. */
export function pickPositions<T extends Fill>(picks: T[]): { pick: T; fills: T[] }[] {
  const positions: { pick: T; fills: T[] }[] = []
  const byKey = new Map<string, { pick: T; fills: T[] }>()
  for (const pick of picks) {
    const key = pick.status === 'open' && pick.event.id
      ? JSON.stringify([pick.event.id, pick.market.kind, pick.market.player, pick.market.statKey, pick.selection, pick.point])
      : null
    const group = key ? byKey.get(key) : undefined
    if (!group) {
      const entry = { pick: { ...pick }, fills: [pick] }
      positions.push(entry)
      if (key) byKey.set(key, entry)
    } else {
      group.fills.push(pick)
      group.pick = { ...group.pick, stake: group.pick.stake + pick.stake, totalReturn: group.pick.totalReturn + pick.totalReturn }
      group.pick.price = decimalToAmerican(group.pick.totalReturn / group.pick.stake)
    }
  }
  return positions
}
