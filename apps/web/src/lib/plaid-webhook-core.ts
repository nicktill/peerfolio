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
