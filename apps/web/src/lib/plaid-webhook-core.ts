import crypto from "node:crypto"
import { importJWK, jwtVerify, type JWK } from "jose"

export type PlaidJWK = JWK & { expired_at?: number | null }

/** Verify signature, key validity, exact body bytes, and the five-minute replay window. */
export async function verifySignedWebhook(rawBody: string, token: string, jwk: PlaidJWK, now = Date.now() / 1000): Promise<boolean> {
  if (typeof jwk.expired_at === "number" && jwk.expired_at <= now) return false
  try {
    const key = await importJWK(jwk, "ES256")
    const { payload } = await jwtVerify(token, key, { algorithms: ["ES256"], currentDate: new Date(now * 1000) })
    const claimed = payload.request_body_sha256
    if (typeof claimed !== "string" || !/^[a-f0-9]{64}$/i.test(claimed)) return false
    const issuedAt = payload.iat
    if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt) || issuedAt > now || now - issuedAt > 300) return false
    const actual = crypto.createHash("sha256").update(rawBody, "utf8").digest()
    const expected = Buffer.from(claimed, "hex")
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

/** Plaid key ids are UUIDs; anything longer is not worth a lookup. */
export const MAX_KEY_ID_LENGTH = 64

/**
 * Resolves a webhook verification key across the configured teams, with a day-long cache for found keys and a short,
 * bounded cache for unknown ones, so random key ids cannot cost a Plaid call per team on every request.
 */
export function createKeyResolver(options: {
  profiles: () => string[]
  fetchKey: (profile: string, kid: string) => Promise<PlaidJWK>
  now?: () => number
  positiveTtlMs?: number
  negativeTtlMs?: number
  maxEntries?: number
}) {
  const now = options.now ?? Date.now
  const positiveTtl = options.positiveTtlMs ?? 24 * 60 * 60 * 1000
  const negativeTtl = options.negativeTtlMs ?? 60_000
  const max = options.maxEntries ?? 500
  const found = new Map<string, { jwk: PlaidJWK; at: number }>()
  const missing = new Map<string, number>()
  const remember = <V,>(map: Map<string, V>, key: string, value: V) => {
    map.delete(key)
    map.set(key, value)
    while (map.size > max) map.delete(map.keys().next().value as string)
  }
  return async (kid: string): Promise<PlaidJWK | null> => {
    if (!kid || kid.length > MAX_KEY_ID_LENGTH) return null
    const hit = found.get(kid)
    if (hit && now() - hit.at < positiveTtl) return hit.jwk
    const miss = missing.get(kid)
    if (miss !== undefined && now() - miss < negativeTtl) return null
    for (const profile of options.profiles()) {
      try {
        const jwk = await options.fetchKey(profile, kid)
        remember(found, kid, { jwk, at: now() })
        return jwk
      } catch {
        // Not this team's key; try the next.
      }
    }
    remember(missing, kid, now())
    return null
  }
}
