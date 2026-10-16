import { createHash, randomBytes, randomUUID } from "node:crypto"
import { SignJWT, createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose"

/**
 * Bearer-token sign-in for the native app.
 *
 * Deliberately free of database and Next imports so it can be unit-tested directly. The website is untouched:
 * it keeps its next-auth cookie, and this module only adds a second way to prove who is calling.
 *
 *   native ID token (Apple / Google) --exchange--> access JWT (15 min) + refresh token (30 days, rotating)
 */

const ISSUER = "peerfolio"
const AUDIENCE = "peerfolio-mobile"

export type MobileAuthConfig = {
  secret: Uint8Array
  accessTtlSec: number
  refreshTtlSec: number
}

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

/**
 * Null when `MOBILE_AUTH_SECRET` is missing or short, which switches the whole mobile path off: no bearer token is
 * accepted and the exchange endpoints answer 503. That keeps a deploy without the secret exactly as it was.
 */
export function mobileAuthConfig(env: Record<string, string | undefined> = process.env): MobileAuthConfig | null {
  const secret = env.MOBILE_AUTH_SECRET?.trim()
  if (!secret || secret.length < 32) return null
  return {
    secret: new TextEncoder().encode(secret),
    accessTtlSec: positiveInt(env.MOBILE_ACCESS_TTL_SECONDS, 15 * 60),
    refreshTtlSec: positiveInt(env.MOBILE_REFRESH_TTL_SECONDS, 30 * 24 * 60 * 60),
  }
}

/** The token from an `Authorization: Bearer …` header, or null for anything else. */
export function bearerToken(header: string | null | undefined): string | null {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "")
  return match ? match[1]! : null
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function signAccessToken(userId: string, config: MobileAuthConfig, now = new Date()) {
  const iat = Math.floor(now.getTime() / 1000)
  const token = await new SignJWT({ use: "access" })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setSubject(userId)
    .setIssuedAt(iat)
    .setExpirationTime(iat + config.accessTtlSec)
    .setJti(randomUUID())
    .sign(config.secret)
  return { token, expiresIn: config.accessTtlSec }
}

/** The user id inside a valid, unexpired access token; null for anything that does not verify. */
export async function verifyAccessToken(token: string, config: MobileAuthConfig, now = new Date()): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, config.secret, { issuer: ISSUER, audience: AUDIENCE, algorithms: ["HS256"], currentDate: now })
    if (payload.use !== "access" || typeof payload.sub !== "string" || !UUID.test(payload.sub)) return null
    return payload.sub
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * Refresh tokens: opaque, hashed at rest, rotated on every use
 * ------------------------------------------------------------------ */

export const hashRefreshToken = (token: string) => createHash("sha256").update(token).digest("hex")

export const newRefreshToken = () => `pfr_${randomBytes(32).toString("base64url")}`

export type RefreshRecord = {
  id: string
  userId: string
  familyId: string
  tokenHash: string
  expiresAt: Date
  usedAt: Date | null
  revokedAt: Date | null
}

export interface RefreshStore {
  insert(record: Pick<RefreshRecord, "userId" | "familyId" | "tokenHash" | "expiresAt">): Promise<void>
  findByHash(tokenHash: string): Promise<RefreshRecord | null>
  /** Marks the token used if nothing has yet; true only for the single caller that won. */
  markUsed(id: string, at: Date): Promise<boolean>
  revokeFamily(familyId: string, at: Date): Promise<void>
}

export type Session = {
  accessToken: string
  refreshToken: string
  tokenType: "Bearer"
  /** Seconds until the access token expires. */
  expiresIn: number
  refreshExpiresAt: string
}

/** Mints an access token and a refresh token, starting a new refresh family unless one is continued. */
export async function issueSession(store: RefreshStore, config: MobileAuthConfig, userId: string, familyId: string = randomUUID(), now = new Date()): Promise<Session> {
  const access = await signAccessToken(userId, config, now)
  const refreshToken = newRefreshToken()
  const expiresAt = new Date(now.getTime() + config.refreshTtlSec * 1000)
  await store.insert({ userId, familyId, tokenHash: hashRefreshToken(refreshToken), expiresAt })
  return { accessToken: access.token, refreshToken, tokenType: "Bearer", expiresIn: access.expiresIn, refreshExpiresAt: expiresAt.toISOString() }
}

export type RotateResult = { ok: true; userId: string; session: Session } | { ok: false; reason: "invalid" | "expired" | "reuse" }

/**
 * Trades a refresh token for a new pair. A token works exactly once: presenting an already-used one means it was
 * copied or replayed, so the whole family is revoked and the real owner has to sign in again.
 */
export async function rotateRefreshToken(store: RefreshStore, config: MobileAuthConfig, presented: string, now = new Date()): Promise<RotateResult> {
  const record = await store.findByHash(hashRefreshToken(presented))
  if (!record || record.revokedAt) return { ok: false, reason: "invalid" }
  if (record.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: "expired" }
  if (record.usedAt || !(await store.markUsed(record.id, now))) {
    await store.revokeFamily(record.familyId, now)
    return { ok: false, reason: "reuse" }
  }
  return { ok: true, userId: record.userId, session: await issueSession(store, config, record.userId, record.familyId, now) }
}

/** Signing out revokes the whole family. Unknown tokens are ignored, so the call is safe to repeat. */
export async function revokeRefreshToken(store: RefreshStore, presented: string, now = new Date()) {
  const record = await store.findByHash(hashRefreshToken(presented))
  if (record) await store.revokeFamily(record.familyId, now)
}

/* ------------------------------------------------------------------ *
 * Provider ID tokens
 * ------------------------------------------------------------------ */

export type IdentityProvider = "apple" | "google"

export type VerifiedIdentity = {
  provider: IdentityProvider
  /** The provider's stable user id (`sub`). Apple hides the email after the first sign-in; this never changes. */
  subject: string
  email: string | null
  emailVerified: boolean
  name: string | null
  image: string | null
}

const PROVIDERS = {
  apple: { issuers: ["https://appleid.apple.com"], jwks: "https://appleid.apple.com/auth/keys" },
  google: { issuers: ["https://accounts.google.com", "accounts.google.com"], jwks: "https://www.googleapis.com/oauth2/v3/certs" },
} as const

const remoteKeys: Partial<Record<IdentityProvider, JWTVerifyGetKey>> = {}
const keysFor = (provider: IdentityProvider): JWTVerifyGetKey => (remoteKeys[provider] ??= createRemoteJWKSet(new URL(PROVIDERS[provider].jwks)))

const list = (value: string | undefined) => (value ?? "").split(",").map((v) => v.trim()).filter(Boolean)

/** Client ids a native token may be issued to. Empty means the provider is not configured and sign-in with it is refused. */
export function identityAudiences(provider: IdentityProvider, env: Record<string, string | undefined> = process.env): string[] {
  // A Google token minted for the native app carries the iOS client id, or the web client id when the app sets a server client id.
  return provider === "apple" ? list(env.APPLE_BUNDLE_ID) : [...list(env.GOOGLE_IOS_CLIENT_ID), ...list(env.GOOGLE_CLIENT_ID)]
}

export class IdentityError extends Error {}

/**
 * Verifies signature, issuer, audience, expiry and the replay-protecting nonce.
 *
 * The app generates a random nonce and sends its SHA-256 to the provider; Apple echoes what it was given and Google
 * echoes it too, so the token is accepted if its nonce is the raw value or that hash.
 */
export async function verifyIdentityToken(
  provider: IdentityProvider,
  idToken: string,
  rawNonce: string,
  options: { audiences: string[]; keys?: JWTVerifyGetKey; now?: Date },
): Promise<VerifiedIdentity> {
  if (options.audiences.length === 0) throw new IdentityError(`${provider} sign-in is not configured`)
  let payload
  try {
    ;({ payload } = await jwtVerify(idToken, options.keys ?? keysFor(provider), {
      issuer: [...PROVIDERS[provider].issuers],
      audience: options.audiences,
      algorithms: ["RS256", "ES256"],
      currentDate: options.now,
    }))
  } catch {
    throw new IdentityError("That sign-in could not be verified")
  }

  const hashed = createHash("sha256").update(rawNonce).digest("hex")
  if (!rawNonce || (payload.nonce !== rawNonce && payload.nonce !== hashed)) throw new IdentityError("That sign-in could not be verified")
  if (typeof payload.sub !== "string" || !payload.sub) throw new IdentityError("That sign-in could not be verified")

  // Apple sends email_verified as the string "true"; Google as a boolean.
  const verified = payload.email_verified === true || payload.email_verified === "true"
  return {
    provider,
    subject: payload.sub,
    email: typeof payload.email === "string" && payload.email ? payload.email.trim().toLowerCase() : null,
    emailVerified: verified,
    name: typeof payload.name === "string" ? payload.name : null,
    image: typeof payload.picture === "string" ? payload.picture : null,
  }
}
