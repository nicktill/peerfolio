import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createKeyResolver, MAX_KEY_ID_LENGTH, type PlaidJWK } from "./plaid-webhook-core.ts"

const jwk = { kty: "EC", crv: "P-256", x: "x", y: "y" } as PlaidJWK

function harness(profiles: string[], knows: Record<string, string[]>, start = 1_000_000) {
  const calls: string[] = []
  let now = start
  const resolve = createKeyResolver({
    profiles: () => profiles,
    fetchKey: async (profile, kid) => {
      calls.push(`${profile}:${kid}`)
      if (!knows[profile]?.includes(kid)) throw new Error("unknown key")
      return jwk
    },
    now: () => now,
    maxEntries: 3,
  })
  return { resolve, calls, advance: (ms: number) => { now += ms } }
}

describe("webhook key resolution", () => {
  it("tries the sandbox profile first outside production", async () => {
    const h = harness(["sandbox"], { sandbox: ["k1"] })
    assert.equal(await h.resolve("k1"), jwk)
    assert.deepEqual(h.calls, ["sandbox:k1"])
  })
  it("falls through to the second team and caches the key for a day", async () => {
    const h = harness(["trial", "trial2"], { trial2: ["k2"] })
    assert.equal(await h.resolve("k2"), jwk)
    assert.deepEqual(h.calls, ["trial:k2", "trial2:k2"])
    await h.resolve("k2")
    assert.equal(h.calls.length, 2)
    h.advance(24 * 60 * 60 * 1000 + 1)
    await h.resolve("k2")
    assert.equal(h.calls.length, 4)
  })
  it("remembers unknown key ids briefly so repeats cost no Plaid calls", async () => {
    const h = harness(["trial", "trial2"], {})
    assert.equal(await h.resolve("nope"), null)
    assert.equal(h.calls.length, 2)
    for (let i = 0; i < 5; i++) assert.equal(await h.resolve("nope"), null)
    assert.equal(h.calls.length, 2)
    h.advance(61_000)
    await h.resolve("nope")
    assert.equal(h.calls.length, 4)
  })
  it("bounds the unknown-key cache and refuses oversized ids without any lookup", async () => {
    const h = harness(["trial"], {})
    for (const kid of ["a", "b", "c", "d"]) await h.resolve(kid)
    assert.equal(h.calls.length, 4)
    await h.resolve("a") // evicted by the bound, so it is looked up again
    assert.equal(h.calls.length, 5)
    assert.equal(await h.resolve("x".repeat(MAX_KEY_ID_LENGTH + 1)), null)
    assert.equal(await h.resolve(""), null)
    assert.equal(h.calls.length, 5)
  })
})
