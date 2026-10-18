// TODO: replace with the exports of @web/lib/sports/parlay once the backend lands (same shapes).
export type ParlayLegRow = {
  lineId: string
  selection: string
  price: number
  point: number | null
  status: "open" | "won" | "lost" | "push" | "void"
  market: { kind: string; player: null }
  event: { id?: string; sport: string; home: string; away: string; startsAt: string }
}

export type ParlayRow = {
  id: string
  stake: number
  /** Combined American odds. */
  price: number
  totalReturn: number
  payout: number | null
  status: "open" | "won" | "lost" | "void"
  acceptedAt: string
  legs: ParlayLegRow[]
  name?: string
  you?: boolean
  /** How many identical open parlays this card stacks (display only). */
  stacked?: number
}

/** Folds identical open parlays (same legs and odds, same bettor) into one card with summed stake and return. */
export function stackParlays(parlays: ParlayRow[]): ParlayRow[] {
  const out: ParlayRow[] = []
  const seen = new Map<string, ParlayRow>()
  for (const p of parlays) {
    if (p.status !== "open") { out.push(p); continue }
    const key = `${p.you ? "me" : p.name ?? ""}|${p.price}|${p.legs.map((l) => l.lineId).sort().join(",")}`
    const head = seen.get(key)
    if (!head) { const first = { ...p, stacked: 1 }; seen.set(key, first); out.push(first); continue }
    head.stake += p.stake
    head.totalReturn += p.totalReturn
    head.stacked = (head.stacked ?? 1) + 1
    if (Date.parse(p.acceptedAt) > Date.parse(head.acceptedAt)) head.acceptedAt = p.acceptedAt
  }
  return out
}

export type ParlayLimits = { minLegs: number; maxLegs: number; minStake: number; maxStake: number }
