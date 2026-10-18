import 'server-only'
import { SignJWT, jwtVerify } from 'jose'
import { ApiError } from '@web/lib/api'
import { isAdminUser } from './access'
import { LIVE_TEST, type TestOffer } from './live-test'

export async function assertLiveTestAdmin(userId: string) {
  if (!(await isAdminUser(userId))) throw new ApiError('Not found', 404)
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
