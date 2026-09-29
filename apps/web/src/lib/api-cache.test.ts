import assert from "node:assert/strict"
import { beforeEach, describe, it } from "node:test"
import { cacheClear, cacheGet, cacheSet, cacheSize, MAX_STALE_MS } from "./api-cache.ts"

beforeEach(() => cacheClear())

describe("cache", () => {
  it("returns what was stored, with its age", () => {
    cacheSet("/api/a", { n: 1 }, 1_000)
    const hit = cacheGet<{ n: number }>("/api/a", 4_000)
    assert.deepEqual(hit, { data: { n: 1 }, ageMs: 3_000 })
  })

  it("misses for unknown keys", () => {
    assert.equal(cacheGet("/api/nope"), null)
  })

  it("treats very old entries as absent, so old numbers never masquerade as fresh", () => {
    cacheSet("/api/a", 1, 0)
    assert.notEqual(cacheGet("/api/a", MAX_STALE_MS), null)
    assert.equal(cacheGet("/api/a", MAX_STALE_MS + 1), null)
    assert.equal(cacheSize(), 0, "expired entry is dropped")
  })

  it("overwrites with the latest response", () => {
    cacheSet("/api/a", 1, 0)
    cacheSet("/api/a", 2, 5)
    assert.equal(cacheGet<number>("/api/a", 6)?.data, 2)
  })

  it("keeps a bounded number of entries, dropping the least recently written", () => {
    for (let i = 0; i < 70; i++) cacheSet(`/api/${i}`, i, 0)
    assert.equal(cacheSize(), 60)
    assert.equal(cacheGet("/api/0", 1), null)
    assert.equal(cacheGet<number>("/api/69", 1)?.data, 69)
  })

  it("clears everything, or just a prefix", () => {
    cacheSet("/api/league/1", 1, 0)
    cacheSet("/api/league/2", 2, 0)
    cacheSet("/api/portfolio", 3, 0)
    cacheClear("/api/league")
    assert.equal(cacheSize(), 1)
    cacheClear()
    assert.equal(cacheSize(), 0)
  })
})
