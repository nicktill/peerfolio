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
}

export type ParlayLimits = { minLegs: number; maxLegs: number; minStake: number; maxStake: number }
