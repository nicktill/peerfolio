import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { acceptPick, DEFAULT_LIMITS, PickRejected, type PickContext } from './picks.ts'
import { acceptTest, testOffer } from './live-test.ts'
import { chooseLiveSlot, isLiveMarketKey, liveMarketKey, liveMaxStake, livePickMessage, liveStakeBounds, LIVE_PICK } from './live-pick.ts'
import { gradePick, planSettlement } from './settlement.ts'
import type { LiveView } from './live/view.ts'

const NOW = Date.parse('2026-10-18T00:00:00Z')
const view = (now = NOW): LiveView => ({ eventId: 'g', status: 'live', score: { home: 2, away: 1 }, period: 'P2', clock: '10:00', stateAsOf: new Date(now - 1000).toISOString(), stateFreshness: 'live', serverTime: new Date(now).toISOString(), odds: { status: 'ok', homeProb: 0.6, awayProb: 0.4, drawProb: null, source: 'polymarket', asOf: new Date(now - 1000).toISOString(), ageMs: 1000, freshness: 'live', confidence: 'high', mismatch: null } })
const limits = { ...DEFAULT_LIMITS, maxStakePctOfStart: Math.min(10, LIVE_PICK.maxStakePct), maxReturnPctOfStart: LIVE_PICK.maxReturnPctOfStart, live: true }
const ctx = (over: Partial<PickContext> = {}): PickContext => ({
  now: new Date(NOW), market: { id: 'm', status: 'locked', lockAt: new Date(NOW - 3600_000) }, eventStatus: 'scheduled', eventStartsAt: new Date(NOW - 3600_000),
  line: { id: 'l', marketId: 'm', price: -150, point: null }, member: { credits: 1000 }, league: { startingCredits: 1000 }, picksOnMarket: 0, openPickCount: 0, openStakeTotal: 0, ...over,
})
const req = (stake: number) => ({ stake, lineId: 'l', expectedPrice: -150, expectedPoint: null })

test('a 7% live longshot can win more than the old payout cap at a valid stake', () => {
  const v = view()
  if (v.odds.status !== 'ok') throw new Error('fixture')
  v.odds = { ...v.odds, homeProb: 0.07, awayProb: 0.93 }
  const price = testOffer(v, NOW).prices.home!
  const context = ctx({ line: { id: 'l', marketId: 'm', price, point: null } })
  const accepted = acceptPick({ ...req(50), expectedPrice: price }, context, limits)
  assert.ok(accepted.totalReturn - accepted.stake > 500)
  assert.throws(() => acceptPick({ ...req(51), expectedPrice: price }, context, limits), /stake|risk|maximum/i)
})

test('live acceptance: in-progress game on a locked live market is accepted at the offered price', () => {
  const a = acceptPick(req(50), ctx(), limits)
  assert.equal(a.stake, 50); assert.equal(a.price, -150); assert.equal(a.totalReturn, 83)
})

test('pregame behaviour is unchanged: the same context is refused after kickoff without live mode', () => {
  assert.throws(() => acceptPick(req(50), ctx(), { ...DEFAULT_LIMITS }), (e: unknown) => e instanceof PickRejected && e.code === 'market_closed')
})

test('live mode still refuses unstarted, finished and open-market contexts', () => {
  for (const over of [{ now: new Date(NOW - 7200_000) }, { eventStatus: 'final' }, { market: { id: 'm', status: 'open', lockAt: new Date(NOW + 1000) } }] as Partial<PickContext>[])
    assert.throws(() => acceptPick(req(50), ctx(over), limits), (e: unknown) => e instanceof PickRejected && e.code === 'market_closed')
})

test('live stake is capped at 5% of starting cash and never above the league limit', () => {
  assert.equal(liveMaxStake(1000, 10), 50); assert.equal(liveMaxStake(1000, 3), 30); assert.equal(liveMaxStake(1000, 60), 50)
  assert.throws(() => acceptPick(req(51), ctx(), limits), (e: unknown) => e instanceof PickRejected && e.code === 'stake_too_large')
  assert.deepEqual(liveStakeBounds(1000, 10), { min: 10, max: 50, message: 'Live picks risk 10 to 50 cash' })
})

test('live picks count toward balance, open-pick and exposure caps', () => {
  assert.throws(() => acceptPick(req(50), ctx({ member: { credits: 40 } }), limits), (e: unknown) => e instanceof PickRejected && e.code === 'insufficient_credits')
  assert.throws(() => acceptPick(req(20), ctx({ openPickCount: 20 }), limits), (e: unknown) => e instanceof PickRejected && e.code === 'too_many_picks')
  assert.throws(() => acceptPick(req(20), ctx({ openStakeTotal: 590 }), limits), (e: unknown) => e instanceof PickRejected && e.code === 'too_much_exposure')
  assert.throws(() => acceptPick(req(20), ctx({ picksOnMarket: 1 }), limits), (e: unknown) => e instanceof PickRejected && e.code === 'already_picked')
})

test('slots: two live picks per game, never the same side twice, first free slot first', () => {
  const now = new Date(NOW)
  assert.equal(chooseLiveSlot({ sport: 'nba', selection: 'home', held: [], lastLiveAt: null, now }), 1)
  assert.equal(chooseLiveSlot({ sport: 'nba', selection: 'away', held: [{ selection: 'home', slot: 1 }], lastLiveAt: null, now }), 2)
  assert.equal(chooseLiveSlot({ sport: 'nba', selection: 'away', held: [{ selection: 'home', slot: 2 }], lastLiveAt: null, now }), 1)
  assert.throws(() => chooseLiveSlot({ sport: 'nba', selection: 'home', held: [{ selection: 'home', slot: 1 }], lastLiveAt: null, now }), /same side|already hold/)
  assert.throws(() => chooseLiveSlot({ sport: 'mls', selection: 'draw', held: [{ selection: 'home', slot: 1 }, { selection: 'away', slot: 2 }], lastLiveAt: null, now }), /2 live picks/)
  assert.throws(() => chooseLiveSlot({ sport: 'nba', selection: 'draw', held: [], lastLiveAt: null, now }), /no draw/)
  assert.equal(chooseLiveSlot({ sport: 'mls', selection: 'draw', held: [], lastLiveAt: null, now }), 1)
})

test('cooldown: 20 seconds between a member\'s live picks, across games', () => {
  const at = (ms: number) => new Date(NOW - ms)
  assert.throws(() => chooseLiveSlot({ sport: 'nba', selection: 'home', held: [], lastLiveAt: at(19_999), now: new Date(NOW) }), /Wait a few seconds/)
  assert.equal(chooseLiveSlot({ sport: 'nba', selection: 'home', held: [], lastLiveAt: at(20_000), now: new Date(NOW) }), 1)
})

test('live market keys are distinct from pregame keys', () => {
  assert.equal(liveMarketKey(2), 'live|2'); assert.ok(isLiveMarketKey('live|1')); assert.ok(!isLiveMarketKey('moneyline|'))
})

const accept = async (mutate?: (v: LiveView, read: number) => void) => {
  let now = NOW; let reads = 0; let claimed = false
  const offer = testOffer(view(), NOW)
  return acceptTest({ offer, selection: 'home', stake: 50, expectedPrice: offer.prices.home!, requestedAt: NOW, bounds: liveStakeBounds(1000, 10) }, {
    now: () => now, claim: async () => { if (claimed) return false; claimed = true; return true }, wait: async ms => { now += ms },
    read: async () => { const v = view(now); mutate?.(v, reads++); return v },
  })
}

test('offer acceptance returns the offered price after the short delayed reread', async () => {
  const receipt = await accept()
  assert.equal(receipt.delayMs, 4_000); assert.equal(receipt.stake, 50)
})

test('live stake bounds replace the paper bounds', async () => {
  const offer = testOffer(view(), NOW)
  const deps = { now: () => NOW, claim: async () => true, wait: async () => {}, read: async () => view() }
  await assert.rejects(acceptTest({ offer, selection: 'home', stake: 51, expectedPrice: offer.prices.home!, requestedAt: NOW, bounds: liveStakeBounds(1000, 10) }, deps), /Live picks risk/)
})

test('rejection when the score, period, source, quote or status changes during the check', async () => {
  const cases: ((v: LiveView, read: number) => void)[] = [
    (v, r) => { if (r > 0) v.score!.away = 2 },
    (v, r) => { if (r > 0) v.period = 'P3' },
    (v, r) => { if (r > 0 && v.odds.status === 'ok') v.odds.source = 'kalshi' },
    (v, r) => { if (r > 0 && v.odds.status === 'ok') { v.odds.homeProb = 0.7; v.odds.awayProb = 0.3 } },
    (v, r) => { if (r > 0) v.status = 'final' },
  ]
  for (const change of cases) {
    const err = await accept(change).then(() => null, (e: Error) => e)
    assert.ok(err, 'must reject')
    if (/changed during the delay/.test(err.message)) assert.equal(livePickMessage(err.message), 'The game changed while we checked. Try again.')
  }
})

test('a replayed offer is refused by the single-use claim', async () => {
  let claimed = false; const now = NOW
  const offer = testOffer(view(), NOW)
  const deps = { now: () => now, claim: async () => { if (claimed) return false; claimed = true; return true }, wait: async () => {}, read: async () => view() }
  await assert.rejects(acceptTest({ offer, selection: 'home', stake: 50, expectedPrice: offer.prices.home!, requestedAt: NOW }, deps))
  claimed = true
  await assert.rejects(acceptTest({ offer, selection: 'home', stake: 50, expectedPrice: offer.prices.home!, requestedAt: NOW }, deps), /already submitted/)
})

test('settlement mapping: a live pick grades and pays exactly like a pregame moneyline pick, and refunds on void', () => {
  const line = { sport: 'nba', kind: 'moneyline' as const, selection: 'home' as const, point: null, player: null, statKey: null }
  const final = (h: number, a: number) => ({ source: 'espn', externalId: '1', status: 'final' as const, homeScore: h, awayScore: a })
  assert.equal(gradePick(line, final(100, 90)), 'win'); assert.equal(gradePick(line, final(90, 100)), 'loss')
  assert.equal(gradePick({ ...line, sport: 'mls', selection: 'draw' }, final(1, 1)), 'win')
  const pick = { id: 'p', memberId: 'm', status: 'open' as const, stake: 50, totalReturn: 83 }
  const win = planSettlement([pick], new Map([['p', 'win' as const]]), new Set())
  assert.equal(win.ledger[0]!.amount, 83); assert.equal(win.ledger[0]!.type, 'settle_win')
  const refund = planSettlement([pick], new Map([['p', 'void' as const]]), new Set())
  assert.equal(refund.ledger[0]!.amount, 50); assert.equal(refund.ledger[0]!.type, 'settle_refund')
})

test('store and route wiring: locked synthetic markets, ledgered debit, locks, replay and attempt logging', () => {
  const store = readFileSync(new URL('./live-store.ts', import.meta.url), 'utf8')
  const route = readFileSync(new URL('../../app/api/sports/leagues/[id]/live/[gameId]/route.ts', import.meta.url), 'utf8')
  assert.match(store, /status: "locked"/); assert.match(store, /\.for\("share"\)/); assert.match(store, /FOR UPDATE/)
  assert.ok(store.indexOf('.for("share")') < store.indexOf('FOR UPDATE'), 'market lock precedes member lock')
  assert.match(store, /type: "place"/); assert.match(store, /placeKey\(pick!\.id\)/); assert.match(store, /live: true/)
  assert.match(route, /withSportsUser/); assert.match(route, /origin/); assert.match(route, /verifyLiveOffer/); assert.match(route, /onConflictDoNothing/)
  assert.match(route, /requestId: signed\.nonce/); assert.match(route, /log\('rejected'/); assert.match(route, /log\('accepted'/)
})
