import { priceTwoWay, totalReturn } from './odds.ts'
import { priceThreeWay } from './threeway.ts'
import type { LiveView } from './live/view.ts'
import type { LiveSelection } from './live/types.ts'

/** Shared offer/delay/freshness machinery. The admin paper test never touches a league; live picks (live-pick.ts) reuse it with their own stake bounds. */
export const LIVE_TEST = { delayMs: 12_000, maxAgeMs: 15_000, offerTtlMs: 20_000, minStake: 10, maxStake: 100 } as const
export type TestOffer = {
  eventId: string; source: 'polymarket' | 'kalshi'; quoteAsOf: string; stateAsOf: string
  homeProb: number; awayProb: number; drawProb: number | null
  homeScore: number; awayScore: number; period: string; clock: string | null
  prices: Partial<Record<LiveSelection, number>>
}
export class LiveTestRejected extends Error {}
const reject = (message: string): never => { throw new LiveTestRejected(message) }
const fresh = (iso: string | null, now: number) => {
  const age = iso ? now - Date.parse(iso) : NaN
  return Number.isFinite(age) && age >= 0 && age <= LIVE_TEST.maxAgeMs
}

export function testOffer(view: LiveView | null, now: number): TestOffer {
  if (!view || view.status !== 'live') return reject('A confirmed live game is required')
  if (!fresh(view.stateAsOf, now) || view.stateFreshness !== 'live') return reject('Score feed is stale; test paused')
  if (!view.score || !Number.isInteger(view.score.home) || !Number.isInteger(view.score.away) || view.score.home! < 0 || view.score.away! < 0 || !view.period) return reject('Complete score and period are required')
  const q = view.odds
  if (q.status !== 'ok' || q.source === 'espn' || q.freshness !== 'live' || q.confidence === 'low' || q.mismatch || !fresh(q.asOf, now)) return reject('A fresh, agreeing exchange quote is required')
  if (![q.homeProb, q.awayProb, ...(q.drawProb == null ? [] : [q.drawProb])].every(p => Number.isFinite(p) && p > 0 && p < 1) || Math.abs(q.homeProb + q.awayProb + (q.drawProb ?? 0) - 1) > 1e-6) return reject('Invalid exchange probabilities')
  const priced = q.drawProb == null ? priceTwoWay(q.homeProb) : priceThreeWay([q.homeProb, q.drawProb, q.awayProb])
  if (!priced) return reject('Market is outside the supported price range')
  const prices = q.drawProb == null ? { home: priced[0], away: priced[1] } : { home: priced[0], draw: priced[1], away: priced[2] }
  return { eventId: view.eventId, source: q.source, quoteAsOf: q.asOf, stateAsOf: view.stateAsOf!, homeProb: q.homeProb, awayProb: q.awayProb, drawProb: q.drawProb, homeScore: view.score.home!, awayScore: view.score.away!, period: view.period, clock: view.clock, prices }
}

export type StakeBounds = { min: number; max: number; message: string }
const PAPER_BOUNDS: StakeBounds = { min: LIVE_TEST.minStake, max: LIVE_TEST.maxStake, message: 'Test stake must be 10–100 play cash' }
export function validateTestRequest(offer: TestOffer, selection: LiveSelection, stake: number, expectedPrice: number, bounds: StakeBounds = PAPER_BOUNDS) {
  if (!Number.isInteger(stake) || stake < bounds.min || stake > bounds.max) return reject(bounds.message)
  if (!['home', 'away', 'draw'].includes(selection) || offer.prices[selection] == null || offer.prices[selection] !== expectedPrice) return reject('The test price changed; refresh the offer')
}

export function compareTestOffers(before: TestOffer, after: TestOffer) {
  if (before.eventId !== after.eventId || before.source !== after.source) return reject('Quote source changed during the delay')
  if (before.homeScore !== after.homeScore || before.awayScore !== after.awayScore || before.period !== after.period) return reject('Score or period changed during the delay')
  if (before.homeProb !== after.homeProb || before.awayProb !== after.awayProb || before.drawProb !== after.drawProb) return reject('Exchange quote changed during the delay')
}

/** Effects injected so delay, duplicate claims and changed feeds are tested without network or a ledger. */
export async function acceptTest(input: { offer: TestOffer; selection: LiveSelection; stake: number; expectedPrice: number; requestedAt: number; bounds?: StakeBounds }, deps: { now(): number; read(): Promise<LiveView | null>; claim(): Promise<boolean>; wait(ms: number): Promise<void> }) {
  validateTestRequest(input.offer, input.selection, input.stake, input.expectedPrice, input.bounds)
  const before = testOffer(await deps.read(), deps.now())
  compareTestOffers(input.offer, before)
  if (!(await deps.claim())) return reject('This test offer was already submitted; refresh it')
  await deps.wait(LIVE_TEST.delayMs)
  if (deps.now() - input.requestedAt < LIVE_TEST.delayMs) return reject('Acceptance delay was not completed')
  const after = testOffer(await deps.read(), deps.now())
  const acceptedAt = deps.now()
  compareTestOffers(before, after)
  if (Date.parse(after.quoteAsOf) <= Math.max(input.requestedAt, Date.parse(before.quoteAsOf)) || Date.parse(after.stateAsOf) <= Math.max(input.requestedAt, Date.parse(before.stateAsOf))) return reject('No new quote and score observation during the delay')
  return { mode: 'ADMIN_PAPER_TEST' as const, selection: input.selection, stake: input.stake, offeredPrice: input.expectedPrice, hypotheticalTotalReturn: totalReturn(input.stake, input.expectedPrice), requestedAt: new Date(input.requestedAt).toISOString(), acceptedAt: new Date(acceptedAt).toISOString(), delayMs: acceptedAt - input.requestedAt, quoteAgeMs: acceptedAt - Date.parse(after.quoteAsOf), stateAgeMs: acceptedAt - Date.parse(after.stateAsOf), offered: input.offer, accepted: after }
}
export type TestReceipt = Awaited<ReturnType<typeof acceptTest>>
