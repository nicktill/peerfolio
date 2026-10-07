import { decodeProtectedHeader } from "jose"
import { getPlaidClient } from "@web/lib/plaid"

import { verifySignedWebhook, type PlaidJWK } from "@web/lib/plaid-webhook-core"
type CachedKey = { jwk: PlaidJWK; fetchedAt: number }
const keyCache = new Map<string, CachedKey>()
const KEY_TTL_MS = 24 * 60 * 60 * 1000

/**
 * Verifies a Plaid webhook per Plaid's scheme: the `plaid-verification` header
 * is an ES256 JWT whose key id identifies a JWK fetched from Plaid, and whose
 * `request_body_sha256` claim must match the raw body.
 *
 * Returns false rather than throwing so the caller can answer 401 without
 * leaking which check failed.
 */
export async function verifyPlaidWebhook(rawBody: string, token: string | null): Promise<boolean> {
  if (!token) return false

  let kid: string
  try {
    const header = decodeProtectedHeader(token)
    if (header.alg !== "ES256" || !header.kid || header.kid.length > 256) return false
    kid = header.kid
  } catch {
    return false
  }

  const jwk = await getVerificationKey(kid)
  return jwk ? verifySignedWebhook(rawBody, token, jwk) : false
}

async function getVerificationKey(kid: string): Promise<PlaidJWK | null> {
  const cached = keyCache.get(kid)
  if (cached && Date.now() - cached.fetchedAt < KEY_TTL_MS) return cached.jwk

  try {
    const { data } = await getPlaidClient().webhookVerificationKeyGet({ key_id: kid })
    const jwk = data.key as unknown as PlaidJWK
    keyCache.set(kid, { jwk, fetchedAt: Date.now() })
    return jwk
  } catch {
    return null
  }
}
