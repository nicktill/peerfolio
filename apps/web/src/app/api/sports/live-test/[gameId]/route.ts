import { NextResponse } from 'next/server'
import { and, like, lt } from 'drizzle-orm'
import { sportsLiveTests, sportsRateLimits } from '@web/db'
import { ApiError, readJson } from '@web/lib/api'
import { db, withSportsUser } from '@web/lib/sports/api'
import { assertLiveTestAdmin, signTestOffer, verifyTestOffer } from '@web/lib/sports/live-test-auth'
import { acceptTest, LiveTestRejected, testOffer } from '@web/lib/sports/live-test'
import { readLiveView } from '@web/lib/sports/live/store'
import { createMemoryLimiter } from '@web/lib/sports/live/cache'
import type { LiveSelection } from '@web/lib/sports/live/types'

type Ctx = { params: Promise<{ gameId: string }> }
export const maxDuration = 30
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const limiter = createMemoryLimiter(12, 60_000)
const headers = { 'Cache-Control': 'private, no-store' }
async function authorize(userId: string, context: Ctx) {
  await assertLiveTestAdmin(userId)
  const { gameId } = await context.params
  if (!UUID.test(gameId)) throw new ApiError('Not found', 404)
  return gameId
}
function testError(error: unknown): never {
  if (error instanceof LiveTestRejected) throw new ApiError(error.message, 409)
  throw error
}

/** Signed, short-lived paper offer. Reads existing worker data only, bypassing display caches. */
export const GET = withSportsUser<Ctx>(async (userId, _request, context) => {
  const gameId = await authorize(userId, context)
  if (!limiter.take(userId, Date.now())) throw new ApiError('Too many test requests; wait a minute', 429)
  try {
    const offer = testOffer(await readLiveView(db, gameId, new Date()), Date.now())
    return NextResponse.json({ offer, token: await signTestOffer(userId, offer) }, { headers })
  } catch (error) { return testError(error) }
})

/** Test receipt only: never writes sports picks, balances, lines, markets, or settlement. */
export const POST = withSportsUser<Ctx>(async (userId, request, context) => {
  const gameId = await authorize(userId, context)
  // Same-origin write in addition to session authentication. No cross-site paper submissions.
  if (request.headers.get('origin') !== new URL(request.url).origin) throw new ApiError('Forbidden', 403)
  if (!limiter.take(userId, Date.now())) throw new ApiError('Too many test requests; wait a minute', 429)
  const body = await readJson<{ token?: unknown; selection?: unknown; stake?: unknown; expectedPrice?: unknown }>(request)
  if (typeof body.token !== 'string' || body.token.length > 6000 || !['home', 'away', 'draw'].includes(String(body.selection)) || typeof body.stake !== 'number' || typeof body.expectedPrice !== 'number') throw new ApiError('Invalid test request')
  const signed = await verifyTestOffer(body.token, userId, gameId)
  const requestedAt = Date.now()
  try {
    const receipt = await acceptTest({ offer: signed.offer, selection: body.selection as LiveSelection, stake: body.stake, expectedPrice: body.expectedPrice, requestedAt }, {
      now: Date.now,
      read: () => readLiveView(db, gameId, new Date()),
      wait: ms => new Promise(resolve => setTimeout(resolve, ms)),
      claim: async () => {
        // Existing shared request-counter table supplies cross-instance replay protection, unrelated to league ledgers.
        const key = `live-test:${userId}:${signed.nonce}`
        const rows = await db.insert(sportsRateLimits).values({ key, bucket: signed.bucket, count: 1 }).onConflictDoNothing().returning({ key: sportsRateLimits.key })
        // Cleanup only expired paper nonces; valid offers live for only 20 seconds.
        await db.delete(sportsRateLimits).where(and(like(sportsRateLimits.key, 'live-test:%'), lt(sportsRateLimits.bucket, signed.bucket - 2)))
        return rows.length === 1
      },
    })
    await assertLiveTestAdmin(userId)
    await db.insert(sportsLiveTests).values({
      id: signed.nonce, userId, eventId: gameId, selection: receipt.selection, stake: receipt.stake, offeredPrice: receipt.offeredPrice,
      requestedAt: new Date(receipt.requestedAt), acceptedAt: new Date(receipt.acceptedAt), quoteAgeMs: Math.round(receipt.quoteAgeMs), stateAgeMs: Math.round(receipt.stateAgeMs), receipt,
    }).onConflictDoNothing()
    return NextResponse.json({ ...receipt, id: signed.nonce, notice: 'Private paper test only. No league cash debited, no winnings paid, no automatic settlement.' }, { headers })
  } catch (error) { return testError(error) }
})
