import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { ApiError } from '@web/lib/api'
import { eq } from 'drizzle-orm'
import { db, users } from '@web/db'
import { isAdminEmail } from '@web/lib/plaid-access-core'
import { LIVE_TEST, type TestOffer } from './live-test'

/** Admins, plus people an admin granted sports access to. Independent of the public sports flag: opening sports to everyone never opens this. */
export async function assertLiveTestAdmin(userId: string) {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  if (!user || !(user.sportsAccess || isAdminEmail(user.email, process.env.ADMIN_EMAILS))) throw new ApiError('Not found', 404)
}
const signingKey = () => {
  const secret = process.env.NEXTAUTH_SECRET
  if (!secret) throw new ApiError('Private test signing is unavailable', 503)
  return new TextEncoder().encode(secret)
}
export async function signTestOffer(userId: string, offer: TestOffer) {
  return new SignJWT({ offer }).setProtectedHeader({ alg: 'HS256' }).setIssuer('peerfolio-live-test').setAudience('admin-paper-test').setSubject(userId).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime(`${LIVE_TEST.offerTtlMs / 1000}s`).sign(signingKey())
}
export async function verifyTestOffer(token: string, userId: string, eventId: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: 'peerfolio-live-test', audience: 'admin-paper-test', subject: userId })
    const offer = payload.offer as TestOffer | undefined
    if (!offer || offer.eventId !== eventId || !payload.jti || !payload.iat) throw new Error('Invalid offer')
    return { offer, nonce: payload.jti, bucket: Math.floor(payload.iat / 86_400) }
  } catch { throw new ApiError('Test offer expired or invalid; refresh it', 409) }
}

/** League live-pick offers: same short-lived signed offer, but a different audience (a paper token never works here) and bound to the league. */
export async function signLiveOffer(userId: string, leagueId: string, offer: TestOffer) {
  return new SignJWT({ offer, leagueId }).setProtectedHeader({ alg: 'HS256' }).setIssuer('peerfolio-live-test').setAudience('league-live-pick').setSubject(userId).setJti(crypto.randomUUID()).setIssuedAt().setExpirationTime(`${LIVE_TEST.offerTtlMs / 1000}s`).sign(signingKey())
}
export async function verifyLiveOffer(token: string, userId: string, leagueId: string, eventId: string) {
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: 'peerfolio-live-test', audience: 'league-live-pick', subject: userId })
    const offer = payload.offer as TestOffer | undefined
    if (!offer || offer.eventId !== eventId || payload.leagueId !== leagueId || !payload.jti || !payload.iat) throw new Error('Invalid offer')
    return { offer, nonce: payload.jti, bucket: Math.floor(payload.iat / 86_400) }
  } catch { throw new ApiError('That offer expired. Refresh and try again.', 409) }
}
