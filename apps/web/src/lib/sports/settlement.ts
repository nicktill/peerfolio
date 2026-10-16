import type { EventResult, MarketKind, Outcome, PickStatus, Selection } from "./types.ts"

/**
 * Settlement. Pure and idempotent.
 *
 *  resolveResult  decides whether we know the outcome yet (wait / review / void / final)
 *  gradePick      grades one pick against a final result
 *  planSettlement turns graded picks into status changes and ledger entries,
 *                 skipping anything already settled or already in the ledger
 *
 * Results come from a source other than the one that priced the line, and a
 * game only settles once enough sources agree.
 */

export type ResolveConfig = {
  /** How many sources must report the same final score. */
  minSources: number
  /** Wait this long after a final is first seen, to let obvious corrections land. */
  settleDelayMs: number
  /** A postponed game with no final this long after its start is voided. */
  postponeGraceMs: number
}

export const DEFAULT_RESOLVE: ResolveConfig = {
  minSources: 2,
  settleDelayMs: 6 * 3600_000,
  postponeGraceMs: 48 * 3600_000,
}

export type Resolution =
  | { kind: "wait"; reason: string }
  | { kind: "review"; reason: string }
  | { kind: "void"; reason: string }
  | { kind: "final"; result: EventResult }

export function resolveResult(
  results: EventResult[],
  ctx: { now: Date; startsAt: Date; finalFirstSeenAt: Date | null },
  cfg: ResolveConfig = DEFAULT_RESOLVE,
): Resolution {
  if (results.some((r) => r.status === "cancelled")) return { kind: "void", reason: "cancelled" }
  // A retirement or walkover ends a tennis match without a full result: refund everyone.
  if (results.some((r) => r.status === "retired")) return { kind: "void", reason: "retired" }

  const finals = results.filter((r) => r.status === "final" && r.homeScore != null && r.awayScore != null)
  if (finals.length === 0) {
    if (results.some((r) => r.status === "postponed") && ctx.now.getTime() - ctx.startsAt.getTime() > cfg.postponeGraceMs) {
      return { kind: "void", reason: "postponed" }
    }
    return { kind: "wait", reason: "no final yet" }
  }

  // Group finals by score; the biggest agreeing group must reach minSources.
  const groups = new Map<string, EventResult[]>()
  for (const r of finals) {
    const key = `${r.homeScore}-${r.awayScore}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  if (groups.size > 1) return { kind: "review", reason: "sources disagree on the score" }
  const agreeing = [...groups.values()][0]!
  if (new Set(agreeing.map((r) => r.source)).size < cfg.minSources) return { kind: "wait", reason: "waiting for a second source" }

  if (!ctx.finalFirstSeenAt || ctx.now.getTime() - ctx.finalFirstSeenAt.getTime() < cfg.settleDelayMs) {
    return { kind: "wait", reason: "settle delay" }
  }

  // Merge player stats: first source that has any wins; conflicting numbers send it to review.
  const withStats = agreeing.filter((r) => r.playerStats)
  const playerStats = withStats[0]?.playerStats
  for (const other of withStats.slice(1)) {
    for (const [player, stats] of Object.entries(other.playerStats ?? {})) {
      for (const [k, v] of Object.entries(stats)) {
        const mine = playerStats?.[player]?.[k]
        if (mine != null && mine !== v) return { kind: "review", reason: `sources disagree on ${player} ${k}` }
      }
    }
  }
  return { kind: "final", result: { ...agreeing[0]!, playerStats } }
}

export type GradableLine = {
  kind: MarketKind
  selection: Selection
  /** The point snapshotted on the pick. For spreads it is the picked side's handicap. */
  point: number | null
  player: string | null
  statKey: string | null
}

/** Grades one pick against a final result. Missing data voids rather than guesses. */
export function gradePick(line: GradableLine, result: EventResult): Outcome {
  if (result.status !== "final" || result.homeScore == null || result.awayScore == null) return "void"
  const { homeScore: h, awayScore: a } = result

  if (line.kind === "moneyline") {
    if (h === a) return "push" // NFL ties refund; tennis and NBA cannot tie
    return (h > a) === (line.selection === "home") ? "win" : "loss"
  }

  if (line.kind === "spread") {
    if (line.point == null) return "void"
    const own = line.selection === "home" ? h : a
    const other = line.selection === "home" ? a : h
    const margin = own + line.point - other
    return margin > 0 ? "win" : margin < 0 ? "loss" : "push"
  }

  const actual =
    line.kind === "total"
      ? h + a
      : line.player && line.statKey
        ? result.playerStats?.[line.player]?.[line.statKey]
        : undefined
  // A player who never appears in the box score voids the prop (DNP policy).
  if (actual == null || line.point == null) return "void"
  if (actual === line.point) return "push"
  return (actual > line.point) === (line.selection === "over") ? "win" : "loss"
}

export type SettleablePick = { id: string; memberId: string; status: PickStatus; stake: number; totalReturn: number }

export type LedgerEntry = {
  /** Unique in the database: replaying a settlement cannot pay twice. */
  idempotencyKey: string
  memberId: string
  pickId: string
  type: "settle_win" | "settle_refund"
  amount: number
}

export type SettlementPlan = {
  statuses: { pickId: string; status: PickStatus }[]
  ledger: LedgerEntry[]
}

export const settleKey = (pickId: string) => `pick:${pickId}:settle`
export const placeKey = (pickId: string) => `pick:${pickId}:place`

const STATUS_OF: Record<Outcome, PickStatus> = { win: "won", loss: "lost", push: "push", void: "void" }

/**
 * Plans the writes to settle `picks` with `outcomes`. Safe to run any number of
 * times: only `open` picks are touched, and a ledger key that already exists
 * is skipped. Losses write no ledger entry because the stake left the balance
 * when the pick was placed.
 */
export function planSettlement(
  picks: SettleablePick[],
  outcomes: ReadonlyMap<string, Outcome>,
  existingKeys: ReadonlySet<string>,
): SettlementPlan {
  const plan: SettlementPlan = { statuses: [], ledger: [] }
  for (const pick of picks) {
    if (pick.status !== "open") continue
    const outcome = outcomes.get(pick.id)
    if (!outcome) continue
    plan.statuses.push({ pickId: pick.id, status: STATUS_OF[outcome] })
    if (outcome === "loss") continue
    const key = settleKey(pick.id)
    if (existingKeys.has(key)) continue
    plan.ledger.push({
      idempotencyKey: key,
      memberId: pick.memberId,
      pickId: pick.id,
      type: outcome === "win" ? "settle_win" : "settle_refund",
      amount: outcome === "win" ? pick.totalReturn : pick.stake,
    })
  }
  return plan
}
