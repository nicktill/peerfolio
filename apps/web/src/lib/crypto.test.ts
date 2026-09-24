import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { decrypt, encrypt, generateInviteCode } from "./crypto.ts"

// 32 bytes of hex, as ENCRYPTION_KEY requires.
process.env.ENCRYPTION_KEY = "a".repeat(64)

describe("encrypt / decrypt", () => {
  it("round-trips a Plaid access token", () => {
    const token = "access-sandbox-1a2b3c4d-5e6f-7a8b-9c0d-1e2f3a4b5c6d"
    assert.equal(decrypt(encrypt(token)), token)
  })

  it("produces different ciphertext each time for the same input", () => {
    // A fixed IV would leak which users share an institution.
    const token = "access-sandbox-same-token"
    assert.notEqual(encrypt(token), encrypt(token))
  })

  it("rejects tampered ciphertext", () => {
    const payload = encrypt("access-sandbox-token")
    const [iv, tag, data] = payload.split(":")
    const flipped = Buffer.from(data!, "base64")
    flipped[0] ^= 0xff

    assert.throws(() => decrypt([iv, tag, flipped.toString("base64")].join(":")))
  })

  it("rejects a malformed payload", () => {
    assert.throws(() => decrypt("not-a-valid-payload"))
  })

  it("round-trips unicode", () => {
    assert.equal(decrypt(encrypt("café 🏦 münchen")), "café 🏦 münchen")
  })
})

describe("generateInviteCode", () => {
  it("omits characters that are ambiguous when read aloud", () => {
    // No O/0, I/1, or vowels that could spell something unfortunate.
    for (let i = 0; i < 200; i++) {
      assert.match(generateInviteCode(), /^[23456789BCDFGHJKLMNPQRSTVWXYZ]{8}$/)
    }
  })

  it("honours the requested length", () => {
    assert.equal(generateInviteCode(12).length, 12)
  })
})
