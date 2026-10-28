import assert from "node:assert/strict"
import { test } from "node:test"
import { buildSourceCookie, parseSourceCookie } from "./signup-source.ts"

test("keeps only the referrer host, utm values and landing path", () => {
  const raw = buildSourceCookie("https://peerfolio.app/?utm_source=x&utm_medium=social&token=secret", "https://www.reddit.com/r/a/comments/1?q=2", "peerfolio.app")!
  assert.deepEqual(parseSourceCookie(raw), { referrer: "reddit.com", utmSource: "x", utmMedium: "social", utmCampaign: null, landingPath: "/" })
})

test("ignores same-site referrers", () => {
  const raw = buildSourceCookie("https://peerfolio.app/", "https://peerfolio.app/leagues", "peerfolio.app")!
  assert.equal(parseSourceCookie(raw)?.referrer, null)
})

test("rejects malformed cookies and clips long values", () => {
  assert.equal(parseSourceCookie("%E0%A4%A"), null)
  assert.equal(parseSourceCookie(encodeURIComponent("[1]")), null)
  assert.equal(parseSourceCookie(undefined), null)
  assert.equal(parseSourceCookie(encodeURIComponent(JSON.stringify({ s: "a".repeat(500) })))?.utmSource?.length, 60)
})
