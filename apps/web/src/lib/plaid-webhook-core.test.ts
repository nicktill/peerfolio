import assert from "node:assert/strict"
import crypto from "node:crypto"
import { describe, it } from "node:test"
import { exportJWK, generateKeyPair, SignJWT } from "jose"
import { verifySignedWebhook } from "./plaid-webhook-core.ts"

const now = 1_800_000_000
const raw = '{"item_id":"abc"}'
const { privateKey, publicKey } = await generateKeyPair("ES256")
const jwk = await exportJWK(publicKey)
const hash = crypto.createHash("sha256").update(raw).digest("hex")
const sign = (claims: Record<string, unknown>) => new SignJWT(claims).setProtectedHeader({ alg: "ES256", kid: "test" }).sign(privateKey)

describe("Plaid signed webhooks", () => {
  it("accepts a correctly signed exact body within five minutes", async () => {
    assert.equal(await verifySignedWebhook(raw, await sign({ iat: now - 299, request_body_sha256: hash }), jwk, now), true)
  })
  it("rejects a tampered body and malformed hashes", async () => {
    assert.equal(await verifySignedWebhook(raw + " ", await sign({ iat: now, request_body_sha256: hash }), jwk, now), false)
    for (const claim of [hash + "zz", hash.slice(0, 62), 123, null]) {
      assert.equal(await verifySignedWebhook(raw, await sign({ iat: now, request_body_sha256: claim }), jwk, now), false)
    }
  })
  it("rejects stale, future, and missing issuance timestamps", async () => {
    for (const iat of [now - 301, now + 1, undefined]) {
      assert.equal(await verifySignedWebhook(raw, await sign({ ...(iat === undefined ? {} : { iat }), request_body_sha256: hash }), jwk, now), false)
    }
  })
  it("rejects expired verification keys and wrong signatures", async () => {
    const token = await sign({ iat: now, request_body_sha256: hash })
    assert.equal(await verifySignedWebhook(raw, token, { ...jwk, expired_at: now }, now), false)
    const other = await generateKeyPair("ES256")
    assert.equal(await verifySignedWebhook(raw, token, await exportJWK(other.publicKey), now), false)
  })
})
