import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readFileSync } from 'node:fs'
import { acceptTest, compareTestOffers, LIVE_TEST, testOffer, validateTestRequest } from './live-test.ts'
import type { LiveView } from './live/view.ts'

const NOW = Date.parse('2026-10-18T00:00:00Z')
const view = (now = NOW): LiveView => ({ eventId: 'g', status: 'live', score: { home: 2, away: 1 }, period: 'P2', clock: '10:00', stateAsOf: new Date(now - 1000).toISOString(), stateFreshness: 'live', serverTime: new Date(now).toISOString(), odds: { status: 'ok', homeProb: 0.6, awayProb: 0.4, drawProb: null, source: 'polymarket', asOf: new Date(now - 1000).toISOString(), ageMs: 1000, freshness: 'live', confidence: 'high', mismatch: null } })

test('paper offers reject stale score, stale quote, non-live games and models', () => {
  const changes: Partial<LiveView>[] = [{ status: 'pre' }, { status: 'final' }, { stateAsOf: new Date(NOW - 46_000).toISOString() }, { stateAsOf: new Date(NOW + 1).toISOString() }, { score: null }, { score: { home: -1, away: 0 } }, { period: null }]
  for (const change of changes) assert.throws(() => testOffer({ ...view(), ...change }, NOW))
  for (const change of [{ source: 'espn' as const }, { asOf: new Date(NOW - 16_000).toISOString() }, { confidence: 'low' as const }, { mismatch: { with: 'kalshi' as const, diff: 0.09 } }, { homeProb: NaN }]) {
    const v = view(); if (v.odds.status !== 'ok') throw new Error('fixture'); v.odds = { ...v.odds, ...change }
    assert.throws(() => testOffer(v, NOW))
  }
})

test('selection, expected price and 10–100 whole play-cash bounds are checked', () => {
  const offer = testOffer(view(), NOW)
  assert.doesNotThrow(() => validateTestRequest(offer, 'home', 10, offer.prices.home!))
  for (const stake of [0, 9, 101, 10.5, NaN]) assert.throws(() => validateTestRequest(offer, 'home', stake, offer.prices.home!))
  assert.throws(() => validateTestRequest(offer, 'home', 10, offer.prices.home! + 5), /price changed/)
  assert.throws(() => validateTestRequest(offer, 'draw', 10, 100))
})

test('three-way draw is priced using existing margin and preserved as a selection', () => {
  const v = view(); if (v.odds.status !== 'ok') throw new Error('fixture')
  v.odds = { ...v.odds, homeProb: 0.4, drawProb: 0.3, awayProb: 0.3 }
  const offer = testOffer(v, NOW)
  assert.ok(offer.prices.draw)
  assert.doesNotThrow(() => validateTestRequest(offer, 'draw', 10, offer.prices.draw!))
})

test('live longshots remain playable in two-way and three-way markets', () => {
  for (const chance of [0.07, 0.01, 0.001, 0.000001]) {
    for (const home of [chance, 1 - chance]) {
      const v = view()
      if (v.odds.status !== 'ok') throw new Error('fixture')
      v.odds = { ...v.odds, homeProb: home, awayProb: 1 - home }
      const offer = testOffer(v, NOW)
      for (const selection of ['home', 'away'] as const) {
        const p = offer.prices[selection]!
        assert.ok(Number.isFinite(p) && Number.isInteger(p) && Math.abs(p) >= 100)
        assert.doesNotThrow(() => validateTestRequest(offer, selection, 10, p))
      }
    }
    const v = view()
    if (v.odds.status !== 'ok') throw new Error('fixture')
    v.odds = { ...v.odds, homeProb: 1 - chance, drawProb: chance / 2, awayProb: chance / 2 }
    const offer = testOffer(v, NOW)
    for (const selection of ['home', 'draw', 'away'] as const) {
      const p = offer.prices[selection]!
      assert.ok(Number.isFinite(p) && Number.isInteger(p) && Math.abs(p) >= 100)
      assert.doesNotThrow(() => validateTestRequest(offer, selection, 10, p))
    }
  }
})

test('a longshot quote still needs fresh, agreeing exchange data', () => {
  const v = view()
  if (v.odds.status !== 'ok') throw new Error('fixture')
  v.odds = { ...v.odds, homeProb: 0.07, awayProb: 0.93, asOf: new Date(NOW - 16_000).toISOString() }
  assert.throws(() => testOffer(v, NOW), /fresh, agreeing/)
})

test('source, score, period and probability changes suspend a test; normal clock progress does not', () => {
  const before = testOffer(view(), NOW)
  for (const change of [{ source: 'kalshi' as const }, { homeScore: 3 }, { awayScore: 2 }, { period: 'P3' }, { homeProb: 0.7, awayProb: 0.3 }, { eventId: 'other' }]) assert.throws(() => compareTestOffers(before, { ...before, ...change }))
  assert.doesNotThrow(() => compareTestOffers(before, { ...before, clock: '09:48' }))
  // An ordinary tick of drift is fine; a bigger move cancels the order, in either direction.
  assert.doesNotThrow(() => compareTestOffers(before, { ...before, homeProb: 0.62, awayProb: 0.38 }, 'home'))
  assert.throws(() => compareTestOffers(before, { ...before, homeProb: 0.64, awayProb: 0.36 }, 'home'), /quote changed/)
  assert.throws(() => compareTestOffers(before, { ...before, homeProb: 0.56, awayProb: 0.44 }, 'away'), /quote changed/)
})

test('delayed acceptance snapshots fresh rereads and duplicate nonce claims reject', async () => {
  let now = NOW; let claimed = false; let reads = 0
  const offer = testOffer(view(), NOW)
  const input = { offer, selection: 'home' as const, stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }
  const deps = { now: () => now, read: async () => { reads++; return view(now) }, claim: async () => { if (claimed) return false; claimed = true; return true }, wait: async (ms: number) => { now += ms } }
  const receipt = await acceptTest(input, deps)
  assert.equal(reads, 2); assert.equal(receipt.delayMs, LIVE_TEST.delayMs)
  assert.equal(receipt.mode, 'ADMIN_PAPER_TEST'); assert.equal(receipt.offeredPrice, offer.prices.home)
  assert.equal(receipt.stake, 10); assert.equal(receipt.quoteAgeMs, 1000)
  await assert.rejects(acceptTest({ ...input, requestedAt: now }, deps), /already submitted/)
})

test('an event during the delay, stalled worker or missing actual delay rejects acceptance', async () => {
  for (const mode of ['score', 'source', 'final', 'quote', 'stalled', 'no-delay'] as const) {
    let now = NOW; let reads = 0
    const offer = testOffer(view(), NOW)
    await assert.rejects(acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
      now: () => now, claim: async () => true, wait: async ms => { if (mode !== 'no-delay') now += ms },
      read: async () => {
        const v = view(mode === 'stalled' ? NOW : now)
        if (reads++ > 0) {
          if (mode === 'score') v.score!.home = 3
          if (mode === 'final') v.status = 'final'
          if (mode === 'source' && v.odds.status === 'ok') v.odds.source = 'kalshi'
          if (mode === 'quote' && v.odds.status === 'ok') { v.odds.homeProb = 0.7; v.odds.awayProb = 0.3 }
        }
        return v
      },
    }))
  }
})

test('private routes require admin auth; no normal pick or settlement API is imported', () => {
  const route = readFileSync(new URL('../../app/api/sports/live-test/[gameId]/route.ts', import.meta.url), 'utf8')
  const capability = readFileSync(new URL('../../app/api/sports/live-test/route.ts', import.meta.url), 'utf8')
  assert.match(route, /withSportsUser/); assert.match(route, /await assertLiveTestAdmin\(userId\)/)
  assert.match(capability, /await assertLiveTestAdmin\(userId\)/)
  assert.match(route, /onConflictDoNothing/); assert.match(route, /verifyTestOffer/)
  for (const forbidden of ['placeSportsPick', 'applySettlement', 'sportsPicks', 'sportsLedger', 'sportsMembers']) assert.ok(!route.includes(forbidden))
})

test('a user waits at most 19 seconds and a quiet feed rejects safely instead of filling on old data', async () => {
  let now = NOW
  const offer = testOffer(view(), NOW)
  const err = await acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
    now: () => now, claim: async () => true, wait: async ms => { now += ms },
    read: async () => view(NOW), // the quote never refreshes
  }).then(() => null, (e: Error) => e)
  assert.ok(err); assert.match(err.message, /No fresh price/)
  assert.ok(now - NOW <= LIVE_TEST.holdMaxMs, `waited ${now - NOW}ms`)
})

test('a small price drift while pending fills at the updated price', async () => {
  let now = NOW; let reads = 0
  const offer = testOffer(view(), NOW)
  const receipt = await acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
    now: () => now, claim: async () => true, wait: async ms => { now += ms },
    read: async () => { const v = view(now); if (reads++ > 0 && v.odds.status === 'ok') { v.odds.homeProb = 0.62; v.odds.awayProb = 0.38 } return v },
  })
  assert.equal(receipt.offeredPrice, offer.prices.home)
  assert.equal(receipt.acceptedPrice, receipt.accepted.prices.home)
})


test('a quote arriving on the normal ten-second worker tick completes one submission', async () => {
  let now = NOW; let claims = 0
  const offer = testOffer(view(), NOW)
  const receipt = await acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
    now: () => now, claim: async () => { claims++; return true }, wait: async ms => { now += ms },
    read: async () => view(now - NOW < 10_000 ? NOW : now),
  })
  assert.equal(receipt.delayMs, 10_000)
  assert.equal(claims, 1)
})

test('a temporary stale quote can recover without a second submission', async () => {
  let now = NOW
  const offer = testOffer(view(), NOW)
  const receipt = await acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
    now: () => now, claim: async () => true, wait: async ms => { now += ms },
    read: async () => view(now - NOW < 15_000 ? NOW : now),
  })
  assert.equal(receipt.delayMs, 15_000)
  assert.ok(receipt.quoteAgeMs <= LIVE_TEST.maxAgeMs)
})


test('league repricing validates the displayed price while paper offers remain exact', () => {
  const offer = testOffer(view(), NOW)
  const displayed = offer.prices.home! + 5
  assert.doesNotThrow(() => validateTestRequest(offer, 'home', 10, displayed, undefined, true))
  assert.throws(() => validateTestRequest(offer, 'home', 10, displayed), /price changed/)
  assert.throws(() => validateTestRequest(offer, 'home', 10, 505, undefined, true), /price changed/)
})


test('a quiet but fresh book can be reconfirmed after submission without changing its price timestamp', async () => {
  let now = NOW
  const offer = testOffer(view(), NOW)
  const receipt = await acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
    now: () => now, claim: async () => true, wait: async ms => { now += ms },
    read: async () => { const v = view(NOW); if (v.odds.status === 'ok') v.odds.observedAsOf = new Date(now).toISOString(); return v },
  })
  assert.equal(receipt.delayMs, LIVE_TEST.delayMs)
  assert.equal(receipt.accepted.quoteAsOf, offer.quoteAsOf)
})

test('a new observation does not turn a stale source price into an acceptable quote', async () => {
  let now = NOW; let reads = 0
  const offer = testOffer(view(), NOW)
  await assert.rejects(acceptTest({ offer, selection: 'home', stake: 10, expectedPrice: offer.prices.home!, requestedAt: NOW }, {
    now: () => now, claim: async () => true, wait: async ms => { now += ms },
    read: async () => { const v = view(now); if (reads++ && v.odds.status === 'ok') { v.odds.asOf = new Date(NOW - 60_000).toISOString(); v.odds.observedAsOf = new Date(now).toISOString() }; return v },
  }), /No fresh price/)
})
