import { hasDraw, type EventResult, type MarketKind, type Outcome, type PickStatus, type Selection, type Sport } from "./types.ts"

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
  /**
   * Fast path. When set, an official final (every agreeing family, at least `minSources` of them) that has been the same
   * plausible score on two settle passes at least this far apart settles without waiting out `settleDelayMs`. Unset means off.
   */
  fastFinalStableMs?: number
  /**
   * Fast path, burst rule. Event-driven triggers poll a just-finished game every ~20 to 30 seconds, so the same official score can be
   * confirmed by several polls within a couple of minutes: `minObservations` distinct polls (at least FINAL_OBS_GAP_MS apart) that all
   * read it, the first at least `ms` ago. Only ever set together with `fastFinalStableMs` (the kill switch clears both), and either rule
   * alone is enough, so the slow cron cadence still settles through the older two-pass rule.
   */
  fastFinalBurst?: { ms: number; minObservations: number }
}

export const DEFAULT_RESOLVE: ResolveConfig = {
  minSources: 2,
  settleDelayMs: 30 * 60_000,
  postponeGraceMs: 48 * 3600_000,
  noResultVoidMs: 72 * 3600_000,
  reviewTimeoutMs: 7 * 24 * 3600_000,
}

/**
 * Quorum policy per sport. Two independent free families exist for NHL (ESPN + the NHL's own API) and MLB (ESPN + MLB's own
 * Stats API), so those need both to agree. Every other sport has ESPN alone, so one family settles it, but behind the stricter
 * single-source safety net: a settle delay of at least SINGLE_SOURCE_SETTLE_DELAY_MS (a floor: while the base delay is 6h that is what
 * applies, and the floor only bites if the base is lowered), a final that must still be the same score
 * when seen again after that delay, plausible-score checks, and review (never auto-settle) for anything odd or changed.
 */
export const FREE_RESULT_FAMILIES: Record<Sport, number> = { nhl: 2, mlb: 2, nfl: 1, nba: 1, cfb: 1, mls: 1, epl: 1, laliga: 1, ucl: 1, wnba: 1, ncaab: 1, tennis: 1 }
export const SINGLE_SOURCE_SETTLE_DELAY_MS = 30 * 60_000
/**
 * Fast path stability windows: how long the same official, plausible final score must have been stable (first read on one
 * pass, confirmed on a later one) to skip the 30 minute settle delay. Sized against the 5 minute settle cadence so the worst
 * case stays within 10 minutes: a final first seen just after a pass waits at most one cadence (5) for the next pass, and the
 * window is shorter than the cadence so that next pass is already the confirming one (even if it fires a minute early).
 *  - one independent family (nfl, nba, cfb, mls, epl, laliga, ucl, wnba, ncaab, tennis): 4 minutes
 *  - two independent families that agree (nhl, mlb): 2 minutes
 */
export const FAST_FINAL_STABLE_MS = 4 * 60_000
export const FAST_TWO_SOURCE_STABLE_MS = 2 * 60_000
/**
 * Burst rule (see ResolveConfig.fastFinalBurst), used when polls arrive every 20 to 30 seconds:
 *  - one independent family: the same official score on at least 3 polls spanning at least 90 seconds
 *  - two independent families that agree: at least 2 polls spanning at least 45 seconds
 */
export const FAST_BURST_SINGLE = { ms: 90_000, minObservations: 3 }
export const FAST_BURST_TWO_SOURCE = { ms: 45_000, minObservations: 2 }
/** Two reads of a final count as separate polls only if this far apart, so concurrent callers cannot count one moment twice. */
export const FINAL_OBS_GAP_MS = 10_000
/** SPORTS_FAST_SETTLE=0 turns the fast path off without a deploy. Read at call time, default on. */
export const fastSettleEnabled = (): boolean => process.env.SPORTS_FAST_SETTLE !== "0"
export type ResolveConfigFor = (sport: Sport) => ResolveConfig

/** The config for one sport given how many independent families can answer for it. Never asks for more families than exist. */
export function resolveConfigForSport(base: ResolveConfig, sport: Sport, availableFamilies: number): ResolveConfig {
  const minSources = Math.max(1, Math.min(FREE_RESULT_FAMILIES[sport], availableFamilies))
  if (minSources >= 2) return { ...base, minSources, ...(fastSettleEnabled() ? { fastFinalStableMs: FAST_TWO_SOURCE_STABLE_MS, fastFinalBurst: FAST_BURST_TWO_SOURCE } : {}) }
  return {
    ...base,
    minSources,
    settleDelayMs: Math.max(base.settleDelayMs, SINGLE_SOURCE_SETTLE_DELAY_MS),
    ...(fastSettleEnabled() ? { fastFinalStableMs: FAST_FINAL_STABLE_MS, fastFinalBurst: FAST_BURST_SINGLE } : {}),
  }
}

/** Highest believable final score per sport (tennis is sets won). Anything above it, negative or fractional is held for review. */
export const MAX_PLAUSIBLE_SCORE: Record<Sport, number> = { nfl: 100, cfb: 120, nba: 200, nhl: 20, mlb: 40, mls: 15, epl: 15, laliga: 15, ucl: 15, wnba: 200, ncaab: 200, tennis: 5 }

/** Why a final score cannot be trusted, or null. Null scores are "no final", not a problem. */
export function scoreProblem(sport: Sport | undefined, home: number | null, away: number | null): string | null {
  for (const n of [home, away]) {
    if (n == null) continue
    if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return `invalid score ${n}`
    if (sport && n > MAX_PLAUSIBLE_SCORE[sport]) return `implausible score ${n} for ${sport}`
  }
  return null
}

export const scoreKey = (r: Pick<EventResult, "homeScore" | "awayScore">) => `${r.homeScore}-${r.awayScore}`

/**
 * What settlement remembers about an event's final between runs: when it was first seen, and the score it had then.
 * `changed` says the stored values need writing. A legacy event (first seen, no score yet) learns its score without
 * restarting the clock.
 */
export function observeFinal(
  mine: EventResult[],
  seen: { firstSeen: Date | null; firstSeenScore: string | null; scoreSeenAt?: Date | null; obs?: number | null; lastObsAt?: Date | null },
  now: Date,
): { firstSeen: Date | null; firstSeenScore: string | null; scoreSeenAt: Date | null; obs: number; lastObsAt: Date | null; changed: boolean } {
  const keep = { obs: seen.obs ?? 0, lastObsAt: seen.lastObsAt ?? null }
  if (!mine.some((r) => r.status === "final")) return { ...seen, scoreSeenAt: seen.scoreSeenAt ?? null, ...keep, changed: false }
  const scores = new Set(mine.filter((r) => r.status === "final" && r.homeScore != null && r.awayScore != null).map(scoreKey))
  const score = scores.size === 1 ? [...scores][0]! : null
  const firstSeen = seen.firstSeen ?? now
  const firstSeenScore = seen.firstSeenScore ?? score
  // When that score was first read. Unknown for events recorded before this was kept, and then the fast path stays off.
  // A row that has the score but never got its time (written before the time was kept) starts that clock now, on this pass, instead of waiting out the full delay.
  const scoreSeenAt = firstSeenScore == null ? null : firstSeenScore === seen.firstSeenScore ? (seen.scoreSeenAt ?? (score === firstSeenScore ? now : null)) : now
  // How many separate polls read that same score. A poll counts once per FINAL_OBS_GAP_MS, and only while the score is still the first one.
  let obs = keep.obs
  let lastObsAt = keep.lastObsAt
  if (firstSeenScore != null && score === firstSeenScore) {
    if (firstSeenScore !== seen.firstSeenScore) {
      obs = 1
      lastObsAt = now
    } else {
      // Events recorded before counting existed: the original read is one observation.
      if (obs === 0 && scoreSeenAt) { obs = 1; lastObsAt = scoreSeenAt }
      if (!lastObsAt || now.getTime() - lastObsAt.getTime() >= FINAL_OBS_GAP_MS) {
        obs = Math.min(obs + 1, 99)
        lastObsAt = now
      }
    }
  }
  const changed = !seen.firstSeen || firstSeenScore !== seen.firstSeenScore || obs !== (seen.obs ?? 0) || (scoreSeenAt != null && !seen.scoreSeenAt)
  return { firstSeen, firstSeenScore, scoreSeenAt, obs, lastObsAt, changed }
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
  /** Sport, for the plausible-score check. */
  sport?: Sport
  /** The score ("home-away") recorded when a final was first seen. If it is set and the final now differs or is gone, the game goes to review. */
  firstSeenScore?: string | null
  /** When `firstSeenScore` was first read. Needed (with a stable window in the config) for the fast path. */
  finalScoreSeenAt?: Date | null
  /** How many separate polls have read `firstSeenScore` (see observeFinal). Needed (with a burst window in the config) for the burst rule. */
  finalObservations?: number
}

/**
 * Fast path: may an official final settle before the full settle delay? Only when ALL hold: the fast window is configured
 * (kill switch not thrown), every agreeing result is flagged `officialFinal` by its provider (and `resolveCore` has already required `minSources` distinct families to agree), the score
 * passes `scoreProblem`, the score recorded on an EARLIER pass is this same score and was first read at least the window ago
 * (two separate passes, far enough apart that one glitchy read cannot pay out), and nothing else is reported for the event
 * (no void/retire/postpone report, no in-progress read). Anything else keeps the normal delay.
 */
export function fastFinalAllowed(agreeing: EventResult[], results: EventResult[], ctx: ResolveContext, cfg: ResolveConfig): boolean {
  if (!cfg.fastFinalStableMs || cfg.fastFinalStableMs <= 0) return false
  if (agreeing.length === 0 || !agreeing.every((r) => r.officialFinal === true && !r.beyondRegulation)) return false
  if (agreeing.some((r) => scoreProblem(ctx.sport, r.homeScore, r.awayScore) !== null)) return false
  if (results.some((r) => r.status !== "final")) return false
  const key = scoreKey(agreeing[0]!)
  if (!ctx.firstSeenScore || ctx.firstSeenScore !== key || !ctx.finalScoreSeenAt) return false
  const stableFor = ctx.now.getTime() - ctx.finalScoreSeenAt.getTime()
  if (stableFor >= cfg.fastFinalStableMs) return true
  const b = cfg.fastFinalBurst
  return !!b && (ctx.finalObservations ?? 0) >= b.minObservations && stableFor >= b.ms
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
  const reported = results.filter((r) => r.status === "final")
  for (const r of reported) {
    const problem = scoreProblem(ctx.sport, r.homeScore, r.awayScore)
    if (problem) return { kind: "review", reason: `${problem} from ${r.source}` }
  }
  // Soccer after extra time or penalties: the 90-minute (three-way) result is not what the feed's score says. A person looks.
  if (reported.some((r) => r.beyondRegulation)) return { kind: "review", reason: "final went to extra time or penalties" }
  const finals = reported.filter((r) => validScore(r.homeScore) && validScore(r.awayScore))
  const groups = new Map<string, EventResult[]>()
  for (const r of finals) groups.set(`${r.homeScore}-${r.awayScore}`, [...(groups.get(`${r.homeScore}-${r.awayScore}`) ?? []), r])
  if (groups.size > 1) return { kind: "review", reason: "sources disagree on the score" }
  if (ctx.firstSeenScore) {
    // A final that was seen and then moved or vanished is not trusted: a person looks.
    if (groups.size === 1 && !groups.has(ctx.firstSeenScore)) return { kind: "review", reason: "final score changed after it was first seen" }
    if (groups.size === 0 && results.some((r) => r.status === "in_progress" || r.status === "scheduled")) return { kind: "review", reason: "final was withdrawn after it was first seen" }
  }
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
    if (!fastFinalAllowed(agreeing, results, ctx, cfg)) return { kind: "wait", reason: "settle delay" }
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

/** Names the free feeds write differently from one another, folded to one key. Keys and values are already normalised. */
const NAME_ALIASES: Record<string, string> = {
  utahhockeyclub: "utahmammoth",
  utahhc: "utahmammoth",
  oaklandathletics: "athletics",
  sacramentoathletics: "athletics",
  lasvegasathletics: "athletics",
  oaklandas: "athletics",
  arizonadbacks: "arizonadiamondbacks",
  arizonadiamondbacks: "arizonadiamondbacks",
  clevelandindians: "clevelandguardians",
  montrealimpact: "cfmontreal",
}
/** Accents folded and punctuation dropped ("Montréal" and "Montreal", "St. Louis" and "St Louis" agree), then known aliases. */
const norm = (s: string) => {
  const n = s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "")
  return NAME_ALIASES[n] ?? n
}
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
  const family = event.aliases?._family
  type Hit = { r: EventResult; swapped: boolean; byId: boolean }
  const hits: Hit[] = []
  for (const r of all) {
    const inWindow = !r.startsAt || Math.abs(r.startsAt.getTime() - event.startsAt.getTime()) <= WINDOW_MS
    const byOwnId = r.externalId === event.externalId && (!family || (r.family ?? r.source) === family) && inWindow
    const byAlias = event.aliases?.[r.source] === r.externalId && inWindow
    const sameOrder = !!r.homeName && !!r.awayName && norm(r.homeName) === norm(event.homeName) && norm(r.awayName) === norm(event.awayName)
    const swapped = !!r.homeName && !!r.awayName && norm(r.homeName) === norm(event.awayName) && norm(r.awayName) === norm(event.homeName)
    const byName = !!r.startsAt && inWindow && (sameOrder || swapped)
    if (!byOwnId && !byAlias && !byName) continue
    hits.push({ r, swapped, byId: byOwnId || byAlias })
  }
  // Doubleheaders and series: two games of the same teams inside the window. An id or alias match settles it; with names alone the
  // closest start time wins, and a tie matches neither (the game waits rather than taking another game's score).
  const kept = hits.filter((h) => {
    if (h.byId) return true
    const rivals = hits.filter((o) => o !== h && o.r.source === h.r.source)
    if (rivals.some((o) => o.byId)) return false
    if (rivals.length === 0) return true
    const gap = (x: Hit) => Math.abs(x.r.startsAt!.getTime() - event.startsAt.getTime())
    return rivals.every((o) => gap(h) < gap(o))
  })
  const results: EventResult[] = []
  const matched: Record<string, string> = {}
  for (const { r, swapped, byId } of kept) {
    results.push(swapped ? { ...r, homeScore: r.awayScore, awayScore: r.homeScore } : r)
    if (!byId) matched[r.source] = r.externalId
  }
  return { results, matched }
}

/** Final-score grading of a three-way market. A draw is a real outcome, never a push. Invalid scores or selection: void (refund). */
export function gradeThreeWay(selection: string, homeScore: number | null, awayScore: number | null): Outcome {
  if (!validScore(homeScore) || !validScore(awayScore)) return "void"
  if (selection !== "home" && selection !== "draw" && selection !== "away") return "void"
  const result = homeScore > awayScore ? "home" : homeScore < awayScore ? "away" : "draw"
  return result === selection ? "win" : "loss"
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
    // Soccer (MLS, Premier League, La Liga, Champions League): home / draw / away. An equal score is the draw side winning, never a void or a push.
    if (hasDraw(line.sport, "moneyline")) return gradeThreeWay(line.selection, h, a)
    // A draw line exists only on a three-way market; anywhere else it cannot be graded.
    if (line.selection === "draw") return "void"
    // NFL (and college football) ties refund as a push. Tennis, NBA, NHL and MLB cannot tie in a final result, so an
    // equal score means the feed is wrong: refund via void.
    if (h === a) return line.sport === "nfl" || line.sport === "cfb" || line.sport === undefined ? "push" : "void"
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
