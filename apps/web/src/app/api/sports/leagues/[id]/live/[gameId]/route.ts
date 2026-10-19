import { NextResponse } from 'next/server'
import { and, like, lt } from 'drizzle-orm'
import { sportsRateLimits } from '@web/db'
import { ApiError, readJson } from '@web/lib/api'
import { db, withSportsUser } from '@web/lib/sports/api'
import { signLiveOffer, verifyLiveOffer } from '@web/lib/sports/live-test-auth'
import { acceptTest, LiveTestRejected, testOffer, LIVE_TEST } from '@web/lib/sports/live-test'
import { LIVE_PICK, livePickMessage, liveStakeBounds } from '@web/lib/sports/live-pick'
import { liveContext, logLiveAttempt, placeLivePick } from '@web/lib/sports/live-store'
import { takeRateLimit } from '@web/lib/sports/store'
import { readLiveView } from '@web/lib/sports/live/store'
import { createMemoryLimiter } from '@web/lib/sports/live/cache'
import type { LiveSelection } from '@web/lib/sports/live/types'

type Ctx = { params: Promise<{ id: string; gameId: string }> }
export const maxDuration = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limiter = createMemoryLimiter(12, 60_000)
const inFlight = new Set<string>()
const headers = { 'Cache-Control': 'private, no-store' }

async function ids(context: Ctx) {
  const { id, gameId } = await context.params
  if (!UUID.test(id) || !UUID.test(gameId)) throw new ApiError('Not found', 404)
  return { id, gameId }
}

/** Signed, short-lived live offer for this member, league and game. Reads existing worker data only, bypassing display caches. */
export const GET = withSportsUser<Ctx>(async (userId, _request, context) => {
  const { id, gameId } = await ids(context)
  if (!limiter.take(userId, Date.now())) throw new ApiError('Too many requests; wait a minute', 429)
  const { league } = await liveContext(db, userId, id, gameId)
  try {
    const offer = testOffer(await readLiveView(db, gameId, new Date()), Date.now())
    const bounds = liveStakeBounds(league.startingCredits, league.maxStakePct)
    return NextResponse.json({ offer, token: await signLiveOffer(userId, id, offer), minStake: bounds.min, maxStake: bounds.max, delayMs: LIVE_TEST.delayMs, maxPerEvent: LIVE_PICK.maxPerEvent }, { headers })
  } catch (error) {
    if (error instanceof LiveTestRejected) throw new ApiError(livePickMessage(error.message), 409)
    throw error
  }
})

/** Accepts a live pick after the delayed reread. Debits league cash and creates a real pick; every attempt is logged. */
export const POST = withSportsUser<Ctx>(async (userId, request, context) => {
  const { id, gameId } = await ids(context)
  // Same-origin write in addition to session authentication.
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Forbidden', 403)
  if (!limiter.take(userId, Date.now()) || !(await takeRateLimit(db, 'pick', userId))) throw new ApiError('Slow down a little, then try again.', 429)
  const body = await readJson<{ token?: unknown; selection?: unknown; stake?: unknown; expectedPrice?: unknown }>(request)
  if (typeof body.token !== 'string' || body.token.length > 6000 || !['home', 'away', 'draw'].includes(String(body.selection)) || typeof body.stake !== 'number' || typeof body.expectedPrice !== 'number') throw new ApiError('Invalid request')
  if (inFlight.has(userId)) throw new ApiError('Your last live pick is still being checked.', 429)
  const { league } = await liveContext(db, userId, id, gameId)
  const signed = await verifyLiveOffer(body.token, userId, id, gameId)
  const requestedAt = Date.now()
  const selection = body.selection as LiveSelection
  const log = (outcome: 'accepted' | 'rejected', reason: string | null, extra: { pickId?: string; acceptedAt?: Date; quoteAgeMs?: number; stateAgeMs?: number; receipt?: unknown } = {}) => logLiveAttempt(db, {
    id: outcome === 'accepted' ? signed.nonce : crypto.randomUUID(), userId, leagueId: id, eventId: gameId, selection, stake: Math.round(body.stake as number), offeredPrice: Math.round(body.expectedPrice as number),
    requestedAt: new Date(requestedAt), acceptedAt: extra.acceptedAt ?? null, quoteAgeMs: extra.quoteAgeMs ?? null, stateAgeMs: extra.stateAgeMs ?? null, outcome, reason, pickId: extra.pickId ?? null, receipt: extra.receipt ?? { offered: signed.offer },
  })
  inFlight.add(userId)
  try {
    const receipt = await acceptTest({ offer: signed.offer, selection, stake: body.stake, expectedPrice: body.expectedPrice, requestedAt, bounds: liveStakeBounds(league.startingCredits, league.maxStakePct), allowReprice: true }, {
      now: Date.now,
      read: () => readLiveView(db, gameId, new Date()),
      wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
      claim: async () => {
        // Single-use offer: the shared counter table gives cross-instance replay protection.
        const key = `live-test:${userId}:${signed.nonce}`
        const rows = await db.insert(sportsRateLimits).values({ key, bucket: signed.bucket, count: 1 }).onConflictDoNothing().returning({ key: sportsRateLimits.key })
        await db.delete(sportsRateLimits).where(and(like(sportsRateLimits.key, 'live-test:%'), lt(sportsRateLimits.bucket, signed.bucket - 2)))
        return rows.length === 1
      },
    })
    try {
      const { pick } = await placeLivePick(db, userId, id, { eventId: gameId, selection, stake: receipt.stake, price: receipt.acceptedPrice, requestId: signed.nonce })
      await log('accepted', null, { pickId: pick.id, acceptedAt: new Date(receipt.acceptedAt), quoteAgeMs: Math.round(receipt.quoteAgeMs), stateAgeMs: Math.round(receipt.stateAgeMs), receipt })
      return NextResponse.json({ pick: { id: pick.id, stake: pick.stake, price: pick.price, totalReturn: pick.totalReturn, selection: pick.selection } }, { status: 201, headers })
    } catch (error) {
      await log('rejected', error instanceof Error ? error.message : 'placement failed', { receipt })
      throw error
    }
  } catch (error) {
    if (error instanceof LiveTestRejected) {
      await log('rejected', error.message)
      throw new ApiError(livePickMessage(error.message), 409)
    }
    throw error
  } finally { inFlight.delete(userId) }
})
