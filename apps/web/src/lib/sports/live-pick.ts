import { DEFAULT_LIMITS } from './picks.ts'
import { hasDraw } from './types.ts'
import type { StakeBounds } from './live-test.ts'
import type { LiveSelection } from './live/types.ts'

/**
 * Live (in-play) league picks. A live pick is an ordinary row in sports_picks on a synthetic LOCKED moneyline market
 * (marketKey "live|1" or "live|2", one per slot, per event) so it settles, voids, refunds and ranks through the existing
 * pipeline with no special cases. The accepted price lives on the pick itself.
 */
export const LIVE_PICK = {
  /** Largest live stake, as a percent of starting cash (never above the league's own pick limit). */
  maxStakePct: 5,
  /** Live picks one member may hold on one game. */
  maxPerEvent: 2,
  /** Minimum gap between a member's live picks, across all games. */
  cooldownMs: 20_000,
} as const

export const LIVE_KEY_PREFIX = 'live|'
export const liveMarketKey = (slot: number) => `${LIVE_KEY_PREFIX}${slot}`
export const isLiveMarketKey = (key: string) => key.startsWith(LIVE_KEY_PREFIX)

export class LivePickRejected extends Error {}
const reject = (message: string): never => { throw new LivePickRejected(message) }

export const liveMaxStake = (startingCredits: number, leagueMaxStakePct: number) =>
  Math.floor((startingCredits * Math.min(LIVE_PICK.maxStakePct, leagueMaxStakePct)) / 100)

export function liveStakeBounds(startingCredits: number, leagueMaxStakePct: number): StakeBounds {
  const max = liveMaxStake(startingCredits, leagueMaxStakePct)
  return { min: DEFAULT_LIMITS.minStake, max, message: `Live picks risk ${DEFAULT_LIMITS.minStake} to ${max} cash` }
}

export type LiveHeld = { selection: string; slot: number }

/** Which slot the next live pick takes, or why it cannot be placed. Pure; the store feeds it rows read under the member lock. */
export function chooseLiveSlot(input: { sport: string; selection: LiveSelection; held: LiveHeld[]; lastLiveAt: Date | null; now: Date }): number {
  if (input.selection === 'draw' && !hasDraw(input.sport, 'moneyline')) return reject('This game has no draw pick')
  if (input.lastLiveAt && input.now.getTime() - input.lastLiveAt.getTime() < LIVE_PICK.cooldownMs) return reject('Wait a few seconds between live picks')
  if (input.held.length >= LIVE_PICK.maxPerEvent) return reject(`You already have ${LIVE_PICK.maxPerEvent} live picks on this game`)
  if (input.held.some(h => h.selection === input.selection)) return reject('You already hold that side live on this game')
  const used = new Set(input.held.map(h => h.slot))
  for (let slot = 1; slot <= LIVE_PICK.maxPerEvent; slot++) if (!used.has(slot)) return slot
  return reject('Live pick limit reached for this game')
}

/** Plain-language text for a rejected attempt; the exact internal reason is only logged. */
export function livePickMessage(reason: string): string {
  if (/changed during the delay|No new quote|Acceptance delay/i.test(reason)) return 'The game changed while we checked. Try again.'
  if (/already submitted|expired|invalid; refresh/i.test(reason)) return 'That offer is no longer valid. Refresh and try again.'
  return reason
}
