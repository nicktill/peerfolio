import { test } from "node:test"
import assert from "node:assert/strict"
import { canonicalUrl, parseFeed } from "./news-feeds.ts"

const RSS = `<?xml version="1.0"?><rss><channel><title>Markets</title>
<item><title><![CDATA[Stocks rise as chipmakers rally &amp; yields hold]]></title>
<link>https://example.com/a?utm_source=rss</link>
<pubDate>Tue, 06 Oct 2026 20:15:00 GMT</pubDate>
<description>&lt;p&gt;The S&amp;P 500 gained 0.4% on Tuesday.&lt;/p&gt;</description></item>
<item><title>No date</title><link>https://example.com/b</link></item>
<item><title>Bad link</title><link>javascript:alert(1)</link><pubDate>Tue, 06 Oct 2026 20:15:00 GMT</pubDate></item>
</channel></rss>`

const ATOM = `<feed><entry><title>Fed holds rates steady</title><link rel="alternate" href="https://example.com/fed"/>
<updated>2026-10-06T18:00:00Z</updated><summary>The Federal Reserve left rates unchanged.</summary></entry></feed>`

test("parses RSS items, decoding CDATA, entities and escaped HTML", () => {
  const items = parseFeed(RSS, "Example")
  assert.equal(items.length, 1)
  assert.equal(items[0]!.title, "Stocks rise as chipmakers rally & yields hold")
  assert.equal(items[0]!.summary, "The S&P 500 gained 0.4% on Tuesday.")
  assert.equal(items[0]!.publishedAt.toISOString(), "2026-10-06T20:15:00.000Z")
})

test("parses Atom entries with href links", () => {
  const [item] = parseFeed(ATOM, "Fed")
  assert.equal(item!.url, "https://example.com/fed")
  assert.equal(item!.summary, "The Federal Reserve left rates unchanged.")
})

test("drops items without a date or an http link", () => {
  assert.deepEqual(
    parseFeed(RSS, "x").map((i) => i.title),
    ["Stocks rise as chipmakers rally & yields hold"],
  )
})

test("canonical URLs drop tracking parameters and fragments", () => {
  assert.equal(canonicalUrl("https://example.com/a?utm_source=rss&id=7#top"), "https://example.com/a?id=7")
})
