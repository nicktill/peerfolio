import { consensusTwoWay, DEFAULT_CONSENSUS, DEFAULT_PRICING, priceTwoWay, type ConsensusOptions, type PricingConfig } from "./odds.ts"
import type { MarketKind, OddsSnapshot, ProviderEvent, ProviderMarket, Selection, Sport } from "./types.ts"

/**
 * Line publishing: turns one cached provider snapshot into fixed contest lines.
 * Pure. The caller supplies `now` and what is already published, so running it
 * twice publishes nothing the second time.
 */

export type PublishConfig = {
  pricing: PricingConfig
  consensus: ConsensusOptions
  /** Reject a snapshot older than this: never price off stale data. */
  maxSnapshotAgeMs: number
  /**
   * Picks close this long before start (games). Two hours, because NFL inactives
   * post about 90 minutes before kickoff and NBA/tennis lineup news lands in the
   * same window: no one should be able to pick after it.
   */
  gameLockMs: number
  /** Props lock at least as early as games. */
  propLockMs: number
  /** Don't publish a market that would be open for less than this. */
  minOpenMs: number
  /**
   * Only publish a market this close to kickoff, so a fixed line is never days
   * old. Lines older than this window cannot exist.
   */
  publishWindowMs: number
  /** Freeze a published market once a fresh consensus has drifted this far (fair probability of side A). */
  moveProb: number
  /** ...or its point (spread, total, prop) has moved this much. */
  movePoint: number
  /** Tennis totals need confirmed score semantics (sets vs games); off until verified. */
  tennisTotals: boolean
}

export const DEFAULT_PUBLISH: PublishConfig = {
  pricing: DEFAULT_PRICING,
  consensus: DEFAULT_CONSENSUS,
  maxSnapshotAgeMs: 10 * 60_000,
  gameLockMs: 2 * 3600_000,
  propLockMs: 2 * 3600_000,
  minOpenMs: 60 * 60_000,
  publishWindowMs: 24 * 3600_000,
  moveProb: 0.04,
  movePoint: 1,
  tennisTotals: false,
}

/** Which market kinds each sport offers. Tennis has no props (no provider evidence). */
export const SPORT_KINDS: Record<Sport, readonly MarketKind[]> = {
  nfl: ["moneyline", "spread", "total", "player_prop"],
  nba: ["moneyline", "spread", "total", "player_prop"],
  tennis: ["moneyline", "total"],
}

export const kindsFor = (sport: Sport, cfg: PublishConfig): readonly MarketKind[] =>
  sport === "tennis" && !cfg.tennisTotals ? ["moneyline"] : SPORT_KINDS[sport]

export type LineDraft = { selection: Selection; price: number; point: number | null }

export type MarketDraft = {
  externalEventId: string
  /** Unique within an event: `${key}|${player}`. */
  marketKey: string
  kind: MarketKind
  player: string | null
  statKey: string | null
  lockAt: Date
  lines: [LineDraft, LineDraft]
  booksUsed: number
  /** Consensus fair probability of the first line's side, kept to detect later movement. */
  fairProbA: number
}

export const marketKeyOf = (m: Pick<ProviderMarket, "key" | "player">) => `${m.key}|${m.player ?? ""}`

export const lockAtFor = (startsAt: Date, kind: MarketKind, cfg: PublishConfig = DEFAULT_PUBLISH): Date =>
  new Date(startsAt.getTime() - (kind === "player_prop" ? cfg.propLockMs : cfg.gameLockMs))

export function draftMarket(event: ProviderEvent, market: ProviderMarket, cfg: PublishConfig, now: Date): MarketDraft | null {
  const [first, second] = market.kind === "total" || market.kind === "player_prop" ? ["over", "under"] : ["home", "away"]
  const a = market.outcomes.find((o) => o.selection === first)
  const b = market.outcomes.find((o) => o.selection === second)
  if (!a || !b) return null

  const consensus = consensusTwoWay(a.quotes, b.quotes, { ...cfg.consensus, now }, market.kind === "spread" ? -1 : 1)
  if (!consensus) return null
  if (market.kind !== "moneyline" && consensus.point == null) return null
  if (market.kind === "moneyline" && consensus.point != null) return null

  const prices = priceTwoWay(consensus.fairProbA, cfg.pricing)
  if (!prices) return null

  const pointA = consensus.point
  const pointB = pointA == null ? null : market.kind === "spread" ? -pointA : pointA
  return {
    externalEventId: event.externalId,
    marketKey: marketKeyOf(market),
    kind: market.kind,
    player: market.player ?? null,
    statKey: market.kind === "player_prop" ? market.key : null,
    lockAt: lockAtFor(event.startsAt, market.kind, cfg),
    lines: [
      { selection: first as Selection, price: prices[0], point: pointA },
      { selection: second as Selection, price: prices[1], point: pointB },
    ],
    booksUsed: consensus.booksUsed,
    fairProbA: consensus.fairProbA,
  }
}

export type PublishPlan = {
  drafts: MarketDraft[]
  /** Why nothing was drafted for the whole snapshot, if so. */
  rejected: "stale_snapshot" | null
}

/**
 * Plans which markets to publish now. `published` holds `${externalEventId}::${marketKey}`
 * for markets that already exist, which are never touched: a published line is
 * fixed for everyone.
 */
export function planPublication(
  snapshot: OddsSnapshot,
  now: Date,
  published: ReadonlySet<string>,
  cfg: PublishConfig = DEFAULT_PUBLISH,
): PublishPlan {
  if (now.getTime() - snapshot.fetchedAt.getTime() > cfg.maxSnapshotAgeMs) return { drafts: [], rejected: "stale_snapshot" }

  const drafts: MarketDraft[] = []
  for (const event of snapshot.events) {
    const allowed = kindsFor(event.sport, cfg)
    if (event.startsAt.getTime() - now.getTime() > cfg.publishWindowMs) continue
    for (const market of event.markets) {
      if (!allowed.includes(market.kind)) continue
      if (published.has(`${event.externalId}::${marketKeyOf(market)}`)) continue
      const lockAt = lockAtFor(event.startsAt, market.kind, cfg)
      if (lockAt.getTime() - now.getTime() < cfg.minOpenMs) continue
      const draft = draftMarket(event, market, cfg, now)
      if (draft) drafts.push(draft)
    }
  }
  return { drafts, rejected: null }
}

/** Pick window check, using server time only. A client clock is never consulted. */
export function isPickWindowOpen(market: { status: string; lockAt: Date }, eventStatus: string, now: Date): boolean {
  return market.status === "open" && eventStatus === "scheduled" && now.getTime() < market.lockAt.getTime()
}

/** Markets that should flip open -> locked now. */
export const marketsToLock = <T extends { status: string; lockAt: Date }>(markets: T[], now: Date): T[] =>
  markets.filter((m) => m.status === "open" && m.lockAt.getTime() <= now.getTime())

/* ---- keeping a published line honest ---- */

export type StoredMarket = {
  kind: MarketKind
  lockAt: Date
  fairProbA: number | null
  /** Point of the first line (null for moneylines). */
  pointA: number | null
}

/**
 * Compares a fresh consensus with the published line. Returns a reason to
 * freeze the market (no new picks at that price) when the true line has moved
 * past the threshold, or null. Existing picks keep the line they were given.
 */
export function detectMove(stored: StoredMarket, fresh: Pick<MarketDraft, "fairProbA" | "lines">, cfg: PublishConfig = DEFAULT_PUBLISH): string | null {
  if (stored.fairProbA != null && Math.abs(fresh.fairProbA - stored.fairProbA) >= cfg.moveProb) return "line moved"
  const pointA = fresh.lines[0].point
  if (stored.pointA != null && pointA != null && Math.abs(pointA - stored.pointA) >= cfg.movePoint) return "line moved"
  return null
}

/**
 * Start times change (tennis especially). When the provider reports a new
 * start, the lock only ever moves earlier. If the new lock has already passed,
 * the market freezes at once.
 */
export function planSchedule(
  market: { kind: MarketKind; lockAt: Date },
  newStart: Date,
  now: Date,
  cfg: PublishConfig = DEFAULT_PUBLISH,
): { lockAt: Date; freeze: string | null } {
  const wanted = lockAtFor(newStart, market.kind, cfg)
  const lockAt = wanted.getTime() < market.lockAt.getTime() ? wanted : market.lockAt
  return { lockAt, freeze: lockAt.getTime() <= now.getTime() && market.lockAt.getTime() > now.getTime() ? "start moved earlier" : null }
}

/** Fresh consensus for every market in a snapshot, keyed `${externalEventId}::${marketKey}`. Used to guard published lines. */
export function freshDrafts(snapshot: OddsSnapshot, now: Date, cfg: PublishConfig = DEFAULT_PUBLISH): Map<string, MarketDraft> {
  const out = new Map<string, MarketDraft>()
  if (now.getTime() - snapshot.fetchedAt.getTime() > cfg.maxSnapshotAgeMs) return out
  for (const event of snapshot.events) {
    for (const market of event.markets) {
      const draft = draftMarket(event, market, cfg, now)
      if (draft) out.set(`${event.externalId}::${draft.marketKey}`, draft)
    }
  }
  return out
}
