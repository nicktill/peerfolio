import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createTtlSet } from "./ttl-set.ts"

describe("ttl set", () => {
  it("expires entries, forgets on delete, and stays bounded", () => {
    let now = 0
    const s = createTtlSet({ ttlMs: 60_000, maxEntries: 2, now: () => now })
    s.add("a")
    assert.equal(s.has("a"), true)
    now = 59_999
    assert.equal(s.has("a"), true)
    now = 60_000
    assert.equal(s.has("a"), false)
    s.add("a")
    s.delete("a")
    assert.equal(s.has("a"), false)
    s.add("x")
    s.add("y")
    s.add("z")
    assert.equal(s.size, 2)
    assert.equal(s.has("x"), false)
    assert.equal(s.has("z"), true)
  })
})
