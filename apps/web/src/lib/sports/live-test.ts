import { acceptsLivePrice } from './live-price.ts'
import { DEFAULT_PRICING, priceTwoWay, totalReturn } from './odds.ts'
import { DEFAULT_THREEWAY_PRICING, priceThreeWay } from './threeway.ts'
import type { LiveView } from './live/view.ts'
import type { LiveSelection } from './live/types.ts'
import { LIVE_MAX_MS } from './live/freshness.ts'

/** Shared offer/delay/freshness machinery. The admin paper test never touches a league; live picks (live-pick.ts) reuse it with their own stake bounds. */
/**
 * Timing is set by what the feeds can support: the exchange worker writes a quote about every 10s, the score feed about every 30s.
 * The order is held at least `delayMs`, then waits (polling) for a quote newer than the request, up to `holdMaxMs` in total, so a
 * user waits 4-19s, allowing the next normal worker tick. No newer quote in time means a safe rejection, not a fill on old data.
 * `probTolerance` is the most the chosen side's win probability may differ from the offered price's probability: about the
 * size of an ordinary tick; anything larger (a score, injury, penalty) cancels the order. Scores/period/status must be unchanged.
 */
export const LIVE_TEST = {
  delayMs: 4_000, holdMaxMs: 19_000, pollMs: 1_000, maxAgeMs: 12_000, stateMaxAgeMs: 45_000, probTolerance: 0.03,
  offerTtlMs: 20_000, minStake: 10, maxStake: 100,
} as const
export type TestOffer = {
  eventId: string; source: 'polymarket' | 'kalshi'; quoteAsOf: string; observedAsOf?: string; stateAsOf: string
  homeProb: number; awayProb: number; drawProb: number | null
  homeScore: number; awayScore: number; period: string; clock: string | null
  prices: Partial<Record<LiveSelection, number>>
}
export class LiveTestRejected extends Error {}
const reject = (message: string): never => { throw new LiveTestRejected(message) }
const fresh = (iso: string | null, now: number, maxAgeMs: number = LIVE_TEST.maxAgeMs) => {
  const age = iso ? now - Date.parse(iso) : NaN
  return Number.isFinite(age) && age >= 0 && age <= maxAgeMs
}

export function testOffer(view: LiveView | null, now: number): TestOffer {
  return offerFor(view, now, LIVE_TEST.maxAgeMs)
}

/** Display caches and browser polling can exceed the execution window. Preview only: signing and acceptance still use testOffer's stricter limit. */
export function displayLiveOffer(view: LiveView | null, now: number): TestOffer {
  return offerFor(view, now, LIVE_MAX_MS - 1)
}

function offerFor(view: LiveView | null, now: number, quoteMaxAgeMs: number): TestOffer {
  if (!view || view.status !== 'live') return reject('A confirmed live game is required')
  if (!fresh(view.stateAsOf, now, LIVE_TEST.stateMaxAgeMs) || view.stateFreshness === 'stale' || view.stateFreshness == null) return reject('Score feed is stale; live picks are paused')
  if (!view.score || !Number.isInteger(view.score.home) || !Number.isInteger(view.score.away) || view.score.home! < 0 || view.score.away! < 0 || !view.period) return reject('Complete score and period are required')
  const q = view.odds
  if (q.status !== 'ok' || q.source === 'espn' || q.freshness !== 'live' || q.confidence === 'low' || q.mismatch || !fresh(q.asOf, now, quoteMaxAgeMs)) return reject('A fresh, agreeing exchange quote is required')
  if (![q.homeProb, q.awayProb, ...(q.drawProb == null ? [] : [q.drawProb])].every(p => Number.isFinite(p) && p > 0 && p < 1) || Math.abs(q.homeProb + q.awayProb + (q.drawProb ?? 0) - 1) > 1e-6) return reject('Invalid exchange probabilities')
  // Live picks accept any non-zero chance. Freshness and quote quality are checked above, independently of probability.
  const priced = q.drawProb == null
    ? priceTwoWay(q.homeProb, { ...DEFAULT_PRICING, minFairProb: 0 })
    : priceThreeWay([q.homeProb, q.drawProb, q.awayProb], { ...DEFAULT_THREEWAY_PRICING, minFairProb: 0 })
  if (!priced) return reject('Invalid exchange prices')
  const prices = q.drawProb == null ? { home: priced[0], away: priced[1] } : { home: priced[0], draw: priced[1], away: priced[2] }
  return { eventId: view.eventId, source: q.source, quoteAsOf: q.asOf, observedAsOf: q.observedAsOf, stateAsOf: view.stateAsOf!, homeProb: q.homeProb, awayProb: q.awayProb, drawProb: q.drawProb, homeScore: view.score.home!, awayScore: view.score.away!, period: view.period, clock: view.clock, prices }
}

export type StakeBounds = { min: number; max: number; message: string }
const PAPER_BOUNDS: StakeBounds = { min: LIVE_TEST.minStake, max: LIVE_TEST.maxStake, message: 'Test stake must be 10–100 play cash' }
export function validateTestRequest(offer: TestOffer, selection: LiveSelection, stake: number, expectedPrice: number, bounds: StakeBounds = PAPER_BOUNDS, allowReprice = false) {
  if (!Number.isInteger(stake) || stake < bounds.min || stake > bounds.max) return reject(bounds.message)
  if (!['home', 'away', 'draw'].includes(selection) || offer.prices[selection] == null || (!allowReprice ? offer.prices[selection] !== expectedPrice : !acceptsLivePrice(expectedPrice, offer.prices[selection]!))) return reject('The test price changed; refresh the offer')
}

/** The chosen side's win probability in an offer. */
const sideProb = (o: TestOffer, selection: LiveSelection) => (selection === 'home' ? o.homeProb : selection === 'away' ? o.awayProb : o.drawProb)

/** Events (source, score, period, game) must be identical; probabilities may drift by an ordinary tick but no more than `probTolerance`. */
export function compareTestOffers(before: TestOffer, after: TestOffer, selection?: LiveSelection) {
  if (before.eventId !== after.eventId || before.source !== after.source) return reject('Quote source changed during the delay')
  if (before.homeScore !== after.homeScore || before.awayScore !== after.awayScore || before.period !== after.period) return reject('Score or period changed during the delay')
  const sides: LiveSelection[] = selection ? [selection] : ['home', 'away', 'draw']
  for (const side of sides) {
    const a = sideProb(before, side), b = sideProb(after, side)
    if ((a == null) !== (b == null)) return reject('Exchange quote changed during the delay')
    if (a != null && b != null && Math.abs(a - b) > LIVE_TEST.probTolerance) return reject('Exchange quote changed during the delay')
  }
}

/** Effects injected so delay, duplicate claims and changed feeds are tested without network or a ledger. */
export async function acceptTest(input: { offer: TestOffer; selection: LiveSelection; stake: number; expectedPrice: number; requestedAt: number; bounds?: StakeBounds; allowReprice?: boolean }, deps: { now(): number; read(): Promise<LiveView | null>; claim(): Promise<boolean>; wait(ms: number): Promise<void> }) {
  validateTestRequest(input.offer, input.selection, input.stake, input.expectedPrice, input.bounds, input.allowReprice)
  const before = testOffer(await deps.read(), deps.now())
  compareTestOffers(input.offer, before, input.selection)
  if (!(await deps.claim())) return reject('This test offer was already submitted; refresh it')
  await deps.wait(LIVE_TEST.delayMs)
  if (deps.now() - input.requestedAt < LIVE_TEST.delayMs) return reject('Acceptance delay was not completed')
  // Require a worker observation after the request. A quiet book need not change price to be confirmed;
  // testOffer still independently enforces source-quote age, score age and quote quality.
  let after: TestOffer
  for (;;) {
    const view = await deps.read()
    if (deps.now() - input.requestedAt > LIVE_TEST.holdMaxMs) return reject('No fresh price arrived in time; nothing was placed. Try again')
    if (view && (view.eventId !== input.offer.eventId || view.status !== 'live'
      || (view.score && (view.score.home !== input.offer.homeScore || view.score.away !== input.offer.awayScore))
      || (view.period && view.period !== input.offer.period))) return reject('Score or period changed during the delay')
    try {
      after = testOffer(view, deps.now())
      compareTestOffers(input.offer, after, input.selection)
      if (Date.parse(after.observedAsOf ?? after.quoteAsOf) > input.requestedAt
        && fresh(after.observedAsOf ?? after.quoteAsOf, deps.now())) break
    } catch (error) {
      if (!(error instanceof LiveTestRejected) || !/fresh, agreeing|Score feed is stale/.test(error.message)) throw error
    }
    if (deps.now() - input.requestedAt + LIVE_TEST.pollMs > LIVE_TEST.holdMaxMs) return reject('No fresh price arrived in time; nothing was placed. Try again')
    await deps.wait(LIVE_TEST.pollMs)
  }
  const acceptedAt = deps.now()
  compareTestOffers(before, after, input.selection)
  // The price the member accepted is also checked against the current market, not only against the earlier read.
  compareTestOffers(input.offer, after, input.selection)
  const acceptedPrice = after.prices[input.selection]!
  if (!acceptsLivePrice(input.expectedPrice, acceptedPrice)) return reject('The price moved too far. Review the updated odds and try again')
  return { acceptedPrice, mode: 'ADMIN_PAPER_TEST' as const, selection: input.selection, stake: input.stake, offeredPrice: input.expectedPrice, hypotheticalTotalReturn: totalReturn(input.stake, acceptedPrice), requestedAt: new Date(input.requestedAt).toISOString(), acceptedAt: new Date(acceptedAt).toISOString(), delayMs: acceptedAt - input.requestedAt, quoteAgeMs: acceptedAt - Date.parse(after.quoteAsOf), stateAgeMs: acceptedAt - Date.parse(after.stateAsOf), offered: input.offer, accepted: after }
}
export type TestReceipt = Awaited<ReturnType<typeof acceptTest>>
