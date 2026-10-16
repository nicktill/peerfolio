import { describe, it } from "node:test"
import assert from "node:assert/strict"
import { cleanSources, collectUrls, domainOf, isKnownUrl, knownSet, mergeSources, normalizeUrl } from "./sources.ts"

describe("normalizeUrl", () => {
  it("treats scheme, www, trailing slash, fragment and tracking as noise", () => {
    const a = normalizeUrl("https://www.Example.com/news/story/?utm_source=x#top")
    assert.equal(a, "example.com/news/story")
    assert.equal(normalizeUrl("http://example.com/news/story"), a)
  })
  it("keeps real query parameters and rejects non-web schemes", () => {
    assert.equal(normalizeUrl("https://example.com/a?id=5&utm_medium=y"), "example.com/a?id=5")
    assert.equal(normalizeUrl("javascript:alert(1)"), null)
    assert.equal(normalizeUrl("not a url"), null)
  })
})

describe("known addresses", () => {
  const known = knownSet(["https://news.example.com/a/b", "https://investor.example.org/"])
  it("accepts an address that was seen, in any equivalent form", () => {
    assert.equal(isKnownUrl("http://www.news.example.com/a/b/", known), true)
    assert.equal(isKnownUrl("https://investor.example.org", known), true)
  })
  it("rejects one that was not, even on the same site", () => {
    assert.equal(isKnownUrl("https://news.example.com/a/other", known), false)
    assert.equal(isKnownUrl("https://made-up.example.net/report", known), false)
  })
})

describe("collectUrls", () => {
  it("finds addresses in JSON and prose without trailing punctuation", () => {
    const urls = collectUrls('{"url":"https://a.com/x","t":"see https://b.com/y)."} and https://a.com/x again')
    assert.deepEqual(urls, ["https://a.com/x", "https://b.com/y"])
  })
})

describe("mergeSources / cleanSources", () => {
  it("keeps one entry per address and lets a citation upgrade a mention", () => {
    const merged = mergeSources([{ url: "https://a.com/x" }], [{ url: "http://www.a.com/x/", title: "A", cited: true }, { url: "https://b.com" }])
    assert.equal(merged.length, 2)
    assert.equal(merged[0]!.cited, true)
    assert.equal(merged[0]!.title, "A")
  })
  it("drops malformed entries", () => {
    assert.deepEqual(cleanSources([{ url: "javascript:x" }, null, { url: 5 }, { url: "https://ok.com", title: "T", cited: true }]), [{ url: "https://ok.com", title: "T", cited: true }])
    assert.deepEqual(cleanSources("nope"), [])
  })
  it("names the domain", () => {
    assert.equal(domainOf("https://www.reuters.com/markets/x"), "reuters.com")
  })
})
