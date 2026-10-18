import { getPlaidClient } from "@web/lib/plaid"
import { verificationProfiles, type PlaidProfile } from "@web/lib/plaid-profile"

import { createKeyResolver, verifySignedWebhook, webhookKeyId, type PlaidJWK } from "@web/lib/plaid-webhook-core"
const resolveKey = createKeyResolver({
  profiles: () => verificationProfiles(process.env),
  fetchKey: async (profile, kid) => {
    const { data } = await getPlaidClient(profile as PlaidProfile).webhookVerificationKeyGet({ key_id: kid })
    return data.key as unknown as PlaidJWK
  },
})

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

  const kid = webhookKeyId(token)
  if (!kid) return false

  const jwk = await resolveKey(kid)
  return jwk ? verifySignedWebhook(rawBody, token, jwk) : false
}
