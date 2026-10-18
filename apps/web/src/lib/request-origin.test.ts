import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { isSameOriginRequest, type OriginCheckInput } from "./request-origin.ts"

const base: OriginCheckInput = { method: "POST", url: "https://www.peerfolio.org/api/sync", origin: null, secFetchSite: null }
const ok = (over: Partial<OriginCheckInput>) => isSameOriginRequest({ ...base, ...over })

describe("same-origin check", () => {
  it("allows a matching Origin", () => assert.equal(ok({ origin: "https://www.peerfolio.org" }), true))
  it("rejects a different origin", () => {
    assert.equal(ok({ origin: "https://evil.example" }), false)
    assert.equal(ok({ origin: "null" }), false)
    assert.equal(ok({ origin: "http://www.peerfolio.org" }), false)
  })
  it("treats www and the apex as different unless configured or forwarded", () => {
    assert.equal(ok({ origin: "https://peerfolio.org" }), false)
    assert.equal(ok({ origin: "https://peerfolio.org", siteUrl: "https://peerfolio.org" }), true)
    assert.equal(ok({ url: "https://peerfolio.org/api/sync", origin: "https://peerfolio.org" }), true)
  })
  it("accepts the forwarded host origin behind a proxy", () => {
    const proxied = { url: "http://localhost:3000/api/sync", forwardedHost: "www.peerfolio.org", forwardedProto: "https" }
    assert.equal(ok({ ...proxied, origin: "https://www.peerfolio.org" }), true)
    assert.equal(ok({ ...proxied, origin: "https://evil.example" }), false)
  })
  it("allows a missing Origin unless fetch metadata says cross-site", () => {
    assert.equal(ok({}), true)
    assert.equal(ok({ secFetchSite: "same-origin" }), true)
    assert.equal(ok({ secFetchSite: "none" }), true)
    assert.equal(ok({ secFetchSite: "same-site" }), true)
    assert.equal(ok({ secFetchSite: "cross-site" }), false)
  })
  it("ignores safe methods", () => {
    assert.equal(ok({ method: "GET", origin: "https://evil.example" }), true)
    assert.equal(ok({ method: "HEAD", secFetchSite: "cross-site" }), true)
    assert.equal(ok({ method: "DELETE", origin: "https://evil.example" }), false)
  })
})
