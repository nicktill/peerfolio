import { SignJWT, importPKCS8 } from "jose"

/**
 * Sign in with Apple token revocation (App Store guideline 5.1.1(v) and Apple's account-deletion rule).
 *
 * Sign-in hands the app a one-time authorization code. The server trades it for a refresh token and keeps that
 * (encrypted); deleting the account sends it to Apple's revoke endpoint so Apple stops listing Peerfolio for the person.
 */

export type AppleRevokeConfig = { teamId: string; keyId: string; privateKey: string; clientId: string }

const APPLE = "https://appleid.apple.com"

/** Null unless every piece is configured; callers then skip revocation rather than fail. */
export function appleRevokeConfig(env: Record<string, string | undefined> = process.env): AppleRevokeConfig | null {
  const teamId = env.APPLE_TEAM_ID?.trim()
  const keyId = env.APPLE_KEY_ID?.trim()
  // Keys pasted into a single-line env var carry literal \n sequences.
  const privateKey = env.APPLE_PRIVATE_KEY?.replace(/\\n/g, "\n").trim()
  const clientId = env.APPLE_BUNDLE_ID?.split(",")[0]?.trim()
  if (!teamId || !keyId || !privateKey || !clientId) return null
  return { teamId, keyId, privateKey, clientId }
}

/** Apple's "client secret" is a short-lived ES256 JWT signed with the team's Sign in with Apple key. */
export async function appleClientSecret(config: AppleRevokeConfig, now = new Date()): Promise<string> {
  const key = await importPKCS8(config.privateKey, "ES256")
  const iat = Math.floor(now.getTime() / 1000)
  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: config.keyId })
    .setIssuer(config.teamId)
    .setSubject(config.clientId)
    .setAudience(APPLE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + 5 * 60)
    .sign(key)
}

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>

const form = (values: Record<string, string>) => new URLSearchParams(values).toString()
const HEADERS = { "Content-Type": "application/x-www-form-urlencoded" }

/** Trades the one-time sign-in code for Apple's refresh token; null if Apple refuses (expired or reused code). */
export async function exchangeAuthorizationCode(config: AppleRevokeConfig, code: string, fetchImpl: FetchLike, now = new Date()): Promise<string | null> {
  const response = await fetchImpl(`${APPLE}/auth/token`, {
    method: "POST",
    headers: HEADERS,
    body: form({ client_id: config.clientId, client_secret: await appleClientSecret(config, now), code, grant_type: "authorization_code" }),
  })
  if (!response.ok) return null
  const body = (await response.json()) as { refresh_token?: unknown }
  return typeof body.refresh_token === "string" ? body.refresh_token : null
}

/** True when Apple accepted the revocation. */
export async function revokeRefreshToken(config: AppleRevokeConfig, refreshToken: string, fetchImpl: FetchLike, now = new Date()): Promise<boolean> {
  const response = await fetchImpl(`${APPLE}/auth/revoke`, {
    method: "POST",
    headers: HEADERS,
    body: form({ client_id: config.clientId, client_secret: await appleClientSecret(config, now), token: refreshToken, token_type_hint: "refresh_token" }),
  })
  return response.ok
}
