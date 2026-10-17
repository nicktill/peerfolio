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
  /** How many INDEPENDENT sources (distinct families) must report the same final score, or the same void. */
  minSources: number
  /** Wait this long after a final is first seen, to let obvious corrections land. */
  settleDelayMs: number
  /** A postponed game with no final this long after its start is voided. */
  postponeGraceMs: number
  /** No source has a final this long after the start (feeds that cannot say "postponed"): void and refund. Only when sources actually answered. */
  noResultVoidMs: number
  /** A game stuck in `review` (sources disagree) this long after its start is voided and refunded, and the owner is told. */
  reviewTimeoutMs: number
}

export const DEFAULT_RESOLVE: ResolveConfig = {
  minSources: 2,
  settleDelayMs: 6 * 3600_000,
  postponeGraceMs: 48 * 3600_000,
  noResultVoidMs: 72 * 3600_000,
  reviewTimeoutMs: 7 * 24 * 3600_000,
}

export type Resolution =
  | { kind: "wait"; reason: string }
  | { kind: "review"; reason: string }
  | { kind: "void"; reason: string }
  | { kind: "final"; result: EventResult }

const familyOf = (r: EventResult) => r.family ?? r.source
const validScore = (n: number | null): n is number => n != null && Number.isFinite(n) && n >= 0

export type ResolveContext = {
  now: Date
  startsAt: Date
  finalFirstSeenAt: Date | null
  /** How many results sources answered this run without error. Unknown (undefined) counts as answered. A failed fetch is NOT "no result". */
  sourcesAnswered?: number
}

const STUCK_WAITS: ReadonlySet<string> = new Set(["void report without quorum", "waiting for a second source"])

export function resolveResult(results: EventResult[], ctx: ResolveContext, cfg: ResolveConfig = DEFAULT_RESOLVE): Resolution {
  const r = resolveCore(results, ctx, cfg)
  // A disagreement nobody resolves must not hold credits forever: refund safely after the timeout.
  if (r.kind === "review" && ctx.now.getTime() - ctx.startsAt.getTime() > cfg.reviewTimeoutMs) return { kind: "void", reason: `review timeout (${r.reason})` }
  // The same backstop for a game that is waiting on a source that never comes (a retirement only one feed reports, a final only
  // one family has): without it those picks stay open forever. An outage ("no results source answered") is not one of these.
  if (r.kind === "wait" && STUCK_WAITS.has(r.reason) && ctx.now.getTime() - ctx.startsAt.getTime() > cfg.reviewTimeoutMs) {
    return { kind: "void", reason: `stuck timeout (${r.reason})` }
  }
  return r
}

function resolveCore(results: EventResult[], ctx: ResolveContext, cfg: ResolveConfig): Resolution {
  const finals = results.filter((r) => r.status === "final" && validScore(r.homeScore) && validScore(r.awayScore))
  const groups = new Map<string, EventResult[]>()
  for (const r of finals) groups.set(`${r.homeScore}-${r.awayScore}`, [...(groups.get(`${r.homeScore}-${r.awayScore}`) ?? []), r])
  if (groups.size > 1) return { kind: "review", reason: "sources disagree on the score" }
  const agreeing = [...groups.values()][0] ?? []
  const finalQuorum = new Set(agreeing.map(familyOf)).size >= cfg.minSources

  // A void report (cancelled, retired) counts only with quorum, and never overrides an agreed final silently.
  const voidFamilies = new Set(results.filter((r) => r.status === "cancelled" || r.status === "retired").map(familyOf))
  const sinceStart = ctx.now.getTime() - ctx.startsAt.getTime()
  if (finalQuorum && voidFamilies.size > 0) {
    // Retirements arrive with partial scores: an agreed final next to a retirement is a human call.
    if (results.some((r) => r.status === "retired")) return { kind: "review", reason: "retirement reported alongside a final score" }
  } else if (voidFamilies.size >= cfg.minSources && sinceStart >= cfg.settleDelayMs) {
    return { kind: "void", reason: results.some((r) => r.status === "cancelled") ? "cancelled" : "retired" }
  } else if (voidFamilies.size > 0 && !finalQuorum) {
    return { kind: "wait", reason: "void report without quorum" }
  }

  if (finals.length === 0) {
    // After an outage every fetch fails and results are empty: that is not evidence the game had no result.
    if ((ctx.sourcesAnswered ?? 1) < 1) return { kind: "wait", reason: "no results source answered" }
    if (results.some((r) => r.status === "postponed") && sinceStart > cfg.postponeGraceMs) return { kind: "void", reason: "postponed" }
    if (sinceStart > cfg.noResultVoidMs) return { kind: "void", reason: "no result" }
    return { kind: "wait", reason: "no final yet" }
  }
  if (!finalQuorum) return { kind: "wait", reason: "waiting for a second source" }
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

/**
 * Whether a metered results source (one that bills per call) is worth asking about this event now. Free sources go first:
 * the metered one is asked only once a free source shows a final AND the settle delay since it was first seen has passed,
 * because that is the moment a second family's final decides the outcome. Retirements, postponements and cancellations are
 * not asked: a score feed cannot report them, so a call could never supply the second family. With no free source at all,
 * the metered one is the only way to settle and is asked every run (the caller still keeps it inside its credit pace).
 */
export function needsMeteredSource(
  event: { finalFirstSeenAt: Date | null },
  freeResults: EventResult[],
  hasFreeSource: boolean,
  now: Date,
  cfg: ResolveConfig = DEFAULT_RESOLVE,
): boolean {
  if (!hasFreeSource) return true
  if (!freeResults.some((r) => r.status === "final")) return false
  return event.finalFirstSeenAt != null && now.getTime() - event.finalFirstSeenAt.getTime() >= cfg.settleDelayMs
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "")
const WINDOW_MS = 3 * 3600_000

/**
 * Picks the results that belong to one of our events, scoped so ids from one
 * vendor can never match another's:
 *  - our own id matches only results from the family that issued it (`aliases._family`);
 *  - a learned alias matches only that source, and still has to fall inside the time window;
 *  - otherwise team names (either orientation) plus the time window.
 * Orientation is decided from the names on EVERY run, never remembered, so a
 * vendor that lists home and away the other way round is always swapped back.
 */
export function resultsForEvent(
  event: { externalId: string; homeName: string; awayName: string; startsAt: Date; aliases?: Record<string, string> },
  all: EventResult[],
): { results: EventResult[]; matched: Record<string, string> } {
  const results: EventResult[] = []
  const matched: Record<string, string> = {}
  const family = event.aliases?._family
  for (const r of all) {
    const inWindow = !r.startsAt || Math.abs(r.startsAt.getTime() - event.startsAt.getTime()) <= WINDOW_MS
    const byOwnId = r.externalId === event.externalId && (!family || (r.family ?? r.source) === family) && inWindow
    const byAlias = event.aliases?.[r.source] === r.externalId && inWindow
    const sameOrder = !!r.homeName && !!r.awayName && norm(r.homeName) === norm(event.homeName) && norm(r.awayName) === norm(event.awayName)
    const swapped = !!r.homeName && !!r.awayName && norm(r.homeName) === norm(event.awayName) && norm(r.awayName) === norm(event.homeName)
    const byName = !!r.startsAt && inWindow && (sameOrder || swapped)
    if (!byOwnId && !byAlias && !byName) continue
    results.push(swapped ? { ...r, homeScore: r.awayScore, awayScore: r.homeScore } : r)
    if (!byOwnId && event.aliases?.[r.source] !== r.externalId) matched[r.source] = r.externalId
  }
  return { results, matched }
}

export type GradableLine = {
  sport?: string
  kind: MarketKind
  selection: Selection
  /** The point snapshotted on the pick. For spreads it is the picked side's handicap. */
  point: number | null
  player: string | null
  statKey: string | null
}

/** Grades one pick against a final result. Missing data voids rather than guesses. */
export function gradePick(line: GradableLine, result: EventResult): Outcome {
  if (result.status !== "final" || !validScore(result.homeScore) || !validScore(result.awayScore)) return "void"
  const { homeScore: h, awayScore: a } = result

  if (line.kind === "moneyline") {
    // NFL ties refund. Tennis and NBA cannot tie, so an equal score means the feed is wrong: refund via void.
    if (h === a) return line.sport === "nfl" || line.sport === undefined ? "push" : "void"
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
  if (actual == null || !Number.isFinite(actual) || line.point == null || !Number.isFinite(line.point)) return "void"
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
