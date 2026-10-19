import { consensusTwoWay, DEFAULT_CONSENSUS, DEFAULT_PRICING, priceTwoWay, type ConsensusOptions, type PricingConfig } from "./odds.ts"
import { consensusThreeWay, DEFAULT_THREEWAY_PRICING, priceThreeWay } from "./threeway.ts"
import { hasDraw, type MarketKind, type OddsSnapshot, type ProviderEvent, type ProviderMarket, type Selection, type Sport } from "./types.ts"

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
   * Picks close this long before start (games). Zero: markets stay open until kickoff, and the server also refuses any
   * pick at or after the scheduled start (see isPickWindowOpen), so this value is never the only guard. The price of
   * a late lock is that inactives/lineup news (NFL about 90 minutes before kickoff) lands while picks are open; the
   * line-move freeze (moveProb/movePoint) and the sentinel are what answer that, not a cushion.
   */
  gameLockMs: number
  /** Props lock no later than games. */
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
  gameLockMs: 0,
  propLockMs: 0,
  minOpenMs: 60 * 60_000,
  publishWindowMs: 24 * 3600_000,
  moveProb: 0.04,
  movePoint: 1,
  tennisTotals: false,
}

/**
 * Exchange mode (no sportsbook consensus): the exchange book is the only "book", so one is enough here. The accuracy gates
 * (spread, resting size, freshness, Kalshi cross-check) live in providers/polymarket-odds.ts, before a market is offered at all.
 */
export const EXCHANGE_PUBLISH: PublishConfig = { ...DEFAULT_PUBLISH, consensus: { ...DEFAULT_CONSENSUS, minBooks: 1 } }

/** Which market kinds each sport offers. Tennis has no props (no provider evidence). */
export const SPORT_KINDS: Record<Sport, readonly MarketKind[]> = {
  nfl: ["moneyline", "spread", "total", "player_prop"],
  nba: ["moneyline", "spread", "total", "player_prop"],
  tennis: ["moneyline", "total"],
  nhl: ["moneyline", "spread", "total"],
  mlb: ["moneyline", "spread", "total"],
  cfb: ["moneyline", "spread", "total"],
  // Soccer moneyline is three-way (home / draw / away): see draftMarket.
  mls: ["moneyline", "spread", "total"],
  epl: ["moneyline", "spread", "total"],
  laliga: ["moneyline", "spread", "total"],
  ucl: ["moneyline", "spread", "total"],
  wnba: ["moneyline", "spread", "total"],
  ncaab: ["moneyline", "spread", "total"],
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
  /** Two lines, or three for the soccer moneyline in the order [home, draw, away]. */
  lines: LineDraft[]
  booksUsed: number
  /** Consensus fair probability of the first line's side, kept to detect later movement. */
  fairProbA: number
  /** Fair probability behind each line, in the same order as `lines`. */
  fairs: number[]
}

export const marketKeyOf = (m: Pick<ProviderMarket, "key" | "player">) => `${m.key}|${m.player ?? ""}`

export const lockAtFor = (startsAt: Date, kind: MarketKind, cfg: PublishConfig = DEFAULT_PUBLISH): Date =>
  new Date(startsAt.getTime() - (kind === "player_prop" ? cfg.propLockMs : cfg.gameLockMs))

/** The soccer moneyline: home / draw / away, priced from books that quote all three. A market without a draw outcome is never priced as two-way. */
function draftThreeWay(event: ProviderEvent, market: ProviderMarket, cfg: PublishConfig, now: Date): MarketDraft | null {
  const quotes = (sel: string) => market.outcomes.find((o) => o.selection === sel)?.quotes ?? []
  const q = { home: quotes("home"), draw: quotes("draw"), away: quotes("away") }
  if (!q.home.length || !q.draw.length || !q.away.length) return null
  const consensus = consensusThreeWay(q, { ...cfg.consensus, now })
  if (!consensus) return null
  const prices = priceThreeWay(consensus.fair, { ...DEFAULT_THREEWAY_PRICING, margin: cfg.pricing.margin })
  if (!prices) return null
  return {
    externalEventId: event.externalId,
    marketKey: marketKeyOf(market),
    kind: "moneyline",
    player: null,
    statKey: null,
    lockAt: lockAtFor(event.startsAt, "moneyline", cfg),
    lines: [
      { selection: "home", price: prices[0], point: null },
      { selection: "draw", price: prices[1], point: null },
      { selection: "away", price: prices[2], point: null },
    ],
    booksUsed: consensus.booksUsed,
    fairProbA: consensus.fair[0],
    fairs: consensus.fair,
  }
}

export function draftMarket(event: ProviderEvent, market: ProviderMarket, cfg: PublishConfig, now: Date): MarketDraft | null {
  if (hasDraw(event.sport, market.kind)) return draftThreeWay(event, market, cfg, now)
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
    fairs: [consensus.fairProbA, 1 - consensus.fairProbA],
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

/**
 * Pick window check, using server time only. A client clock is never consulted. Two independent time gates: the
 * market's own lock, and the event's scheduled start. Whichever comes first closes it, so a market whose lock was
 * ever set late (or never moved when a start moved earlier) still cannot take a pick once the game has begun.
 */
export function isPickWindowOpen(market: { status: string; lockAt: Date }, eventStatus: string, now: Date, eventStartsAt?: Date): boolean {
  if (eventStartsAt && now.getTime() >= eventStartsAt.getTime()) return false
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
  /** Fair probability behind each line (home, draw, away for soccer), where stored. Any side moving counts. */
  fairs?: (number | null)[] | null
  /** Point of the first line (null for moneylines). */
  pointA: number | null
}

/**
 * Compares a fresh consensus with the published line. Returns a reason to
 * freeze the market (no new picks at that price) when the true line has moved
 * past the threshold, or null. Existing picks keep the line they were given.
 */
export function detectMove(stored: StoredMarket, fresh: Pick<MarketDraft, "fairProbA" | "lines"> & { fairs?: number[] }, cfg: PublishConfig = DEFAULT_PUBLISH): string | null {
  if (stored.fairProbA != null && Math.abs(fresh.fairProbA - stored.fairProbA) >= cfg.moveProb) return "line moved"
  // Every side, not only the first: a three-way market can move on the draw alone.
  if (stored.fairs && fresh.fairs && stored.fairs.length === fresh.fairs.length && fresh.fairs.some((f, i) => stored.fairs![i] != null && Math.abs(f - stored.fairs![i]!) >= cfg.moveProb)) return "line moved"
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

/**
 * Whether a published market has disappeared from a trustworthy snapshot (the
 * event was dropped, or a prop was pulled). Absence from a snapshot where a
 * source failed or was skipped, or from an empty or stale one, proves nothing.
 */
export function missingReason(snapshot: OddsSnapshot, now: Date, externalId: string, marketKey: string, cfg: PublishConfig = DEFAULT_PUBLISH): string | null {
  if (snapshot.complete === false || snapshot.events.length === 0) return null
  if (now.getTime() - snapshot.fetchedAt.getTime() > cfg.maxSnapshotAgeMs) return null
  const ev = snapshot.events.find((e) => e.externalId === externalId)
  if (!ev) return "event no longer offered"
  return ev.markets.some((m) => marketKeyOf(m) === marketKey) ? null : "market no longer offered"
}

/* ---- when to spend credits on a fetch ---- */

/** Exchange mode costs no credits, so the only pacing is politeness: a sport is fetched at most once per bucket (see makeExchangeGate). */
export const EXCHANGE_BUCKET_MS = 30 * 60_000
export const exchangeBucket = (now: Date): number => Math.floor(now.getTime() / EXCHANGE_BUCKET_MS)

export const GUARD_BUCKET_MS = 2 * 3600_000
export const DISCOVER_BUCKET_MS = 12 * 3600_000

/**
 * Whether a sport is worth a (paid) odds fetch now, and which budget bucket it spends.
 *  - "guard": an unlocked market exists, so a fresh consensus can freeze it if the line moved. At most one per 2 hours.
 *  - "discover": nothing is open, but a game starts within 24h (the publish window), so lines can be published. At most one per 12 hours.
 *  - null: nothing to do, spend nothing. `gameWithin24h` null means unknown (free schedule check failed): treated as yes.
 * The caller claims the bucket, so the first cron run in it fetches and later ones (and late GitHub runs) do not.
 */
export function fetchKind(s: { hasUnlockedMarket: boolean; gameWithin24h: boolean | null }): "guard" | "discover" | null {
  if (s.hasUnlockedMarket) return "guard"
  return s.gameWithin24h === false ? null : "discover"
}

export const fetchBucket = (kind: "guard" | "discover", now: Date): number => Math.floor(now.getTime() / (kind === "guard" ? GUARD_BUCKET_MS : DISCOVER_BUCKET_MS))
