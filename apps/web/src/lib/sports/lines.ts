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
  /** Picks close this long before start (games). */
  gameLockMs: number
  /** Props lock earlier, because lineup news lands pregame. */
  propLockMs: number
  /** Don't publish a market that would be open for less than this. */
  minOpenMs: number
}

export const DEFAULT_PUBLISH: PublishConfig = {
  pricing: DEFAULT_PRICING,
  consensus: DEFAULT_CONSENSUS,
  maxSnapshotAgeMs: 10 * 60_000,
  gameLockMs: 30 * 60_000,
  propLockMs: 60 * 60_000,
  minOpenMs: 60 * 60_000,
}

/** Which market kinds each sport offers. Tennis has no props (no provider evidence). */
export const SPORT_KINDS: Record<Sport, readonly MarketKind[]> = {
  nfl: ["moneyline", "spread", "total", "player_prop"],
  nba: ["moneyline", "spread", "total", "player_prop"],
  tennis: ["moneyline", "total"],
}

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
}

export const marketKeyOf = (m: Pick<ProviderMarket, "key" | "player">) => `${m.key}|${m.player ?? ""}`

export const lockAtFor = (startsAt: Date, kind: MarketKind, cfg: PublishConfig = DEFAULT_PUBLISH): Date =>
  new Date(startsAt.getTime() - (kind === "player_prop" ? cfg.propLockMs : cfg.gameLockMs))

function draftMarket(event: ProviderEvent, market: ProviderMarket, cfg: PublishConfig): MarketDraft | null {
  const [first, second] = market.kind === "total" || market.kind === "player_prop" ? ["over", "under"] : ["home", "away"]
  const a = market.outcomes.find((o) => o.selection === first)
  const b = market.outcomes.find((o) => o.selection === second)
  if (!a || !b) return null

  const consensus = consensusTwoWay(a.quotes, b.quotes, cfg.consensus, market.kind === "spread" ? -1 : 1)
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
    const allowed = SPORT_KINDS[event.sport]
    for (const market of event.markets) {
      if (!allowed.includes(market.kind)) continue
      if (published.has(`${event.externalId}::${marketKeyOf(market)}`)) continue
      const lockAt = lockAtFor(event.startsAt, market.kind, cfg)
      if (lockAt.getTime() - now.getTime() < cfg.minOpenMs) continue
      const draft = draftMarket(event, market, cfg)
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
