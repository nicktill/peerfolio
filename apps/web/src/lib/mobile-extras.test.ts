import assert from "node:assert/strict"
import { test } from "node:test"
import { exportPKCS8, generateKeyPair, jwtVerify, decodeProtectedHeader } from "jose"
import { appleClientSecret, appleRevokeConfig, exchangeAuthorizationCode, revokeRefreshToken, type FetchLike } from "./apple-revoke-core.ts"
import { MOBILE_LIMITS, checkRateLimit, clientAddress, hashKey, type RateStore } from "./rate-limit-core.ts"
import { matchesReviewLogin, reviewLoginConfig } from "./review-login-core.ts"

function memoryRateStore(): RateStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>()
  return {
    counts,
    async hit(key, start) {
      const k = `${key}|${start.getTime()}`
      counts.set(k, (counts.get(k) ?? 0) + 1)
      return counts.get(k)!
    },
    async prune() {},
  }
}

test("the limiter allows up to the limit, then blocks until the window rolls over", async () => {
  const store = memoryRateStore()
  const policy = { limit: 3, windowSec: 60 }
  const t0 = new Date("2026-01-01T00:00:10Z")
  for (let i = 0; i < 3; i++) assert.equal((await checkRateLimit(store, "ip:1", policy, t0)).ok, true)
  const blocked = await checkRateLimit(store, "ip:1", policy, t0)
  assert.equal(blocked.ok, false)
  assert.equal(blocked.remaining, 0)
  assert.equal(blocked.retryAfterSec, 50)
  assert.equal((await checkRateLimit(store, "ip:2", policy, t0)).ok, true, "other callers are unaffected")
  assert.equal((await checkRateLimit(store, "ip:1", policy, new Date("2026-01-01T00:01:01Z"))).ok, true, "a new window starts fresh")
})

test("keys are hashed and the client address comes from the forwarded header", () => {
  assert.equal(hashKey("1.2.3.4").length, 32)
  assert.notEqual(hashKey("1.2.3.4"), "1.2.3.4")
  const h = (v: Record<string, string>) => ({ get: (n: string) => v[n] ?? null })
  assert.equal(clientAddress(h({ "x-forwarded-for": "9.9.9.9, 10.0.0.1" })), "9.9.9.9")
  assert.equal(clientAddress(h({ "x-real-ip": "8.8.8.8" })), "8.8.8.8")
  assert.equal(clientAddress(h({})), "unknown")
  assert.ok(MOBILE_LIMITS.review.limit < MOBILE_LIMITS.token.limit)
})

test("the review login is off unless fully configured with a long code", () => {
  assert.equal(reviewLoginConfig({}), null)
  assert.equal(reviewLoginConfig({ APP_REVIEW_EMAIL: "r@x.co", APP_REVIEW_CODE: "short" }), null)
  assert.equal(reviewLoginConfig({ APP_REVIEW_EMAIL: "nope", APP_REVIEW_CODE: "a".repeat(24) }), null)
  const config = reviewLoginConfig({ APP_REVIEW_EMAIL: " Reviewer@Example.com ", APP_REVIEW_CODE: "c".repeat(24) })!
  assert.equal(config.email, "reviewer@example.com")
  assert.equal(config.seedDemo, false)
  assert.equal(reviewLoginConfig({ APP_REVIEW_EMAIL: "r@x.co", APP_REVIEW_CODE: "c".repeat(24), APP_REVIEW_SEED_DEMO: "true" })!.seedDemo, true)
})

test("the review login matches only the agreed email and code", () => {
  const config = reviewLoginConfig({ APP_REVIEW_EMAIL: "reviewer@example.com", APP_REVIEW_CODE: "c".repeat(24) })!
  assert.equal(matchesReviewLogin(config, "Reviewer@example.com", "c".repeat(24)), true)
  assert.equal(matchesReviewLogin(config, "reviewer@example.com", "c".repeat(23)), false)
  assert.equal(matchesReviewLogin(config, "someone@else.com", "c".repeat(24)), false)
  assert.equal(matchesReviewLogin(config, "", ""), false)
})

async function appleConfig() {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true })
  const pem = await exportPKCS8(privateKey)
  return { publicKey, config: appleRevokeConfig({ APPLE_TEAM_ID: "TEAM123456", APPLE_KEY_ID: "KEY1234567", APPLE_PRIVATE_KEY: pem.replace(/\n/g, "\\n"), APPLE_BUNDLE_ID: "org.peerfolio.app,org.peerfolio.dev" })! }
}

test("revocation is unconfigured without every Apple setting", () => {
  assert.equal(appleRevokeConfig({}), null)
  assert.equal(appleRevokeConfig({ APPLE_TEAM_ID: "T", APPLE_KEY_ID: "K", APPLE_BUNDLE_ID: "b" }), null)
})

test("the Apple client secret is an ES256 JWT for the team and app", async () => {
  const { config, publicKey } = await appleConfig()
  const secret = await appleClientSecret(config)
  assert.equal(decodeProtectedHeader(secret).kid, "KEY1234567")
  const { payload } = await jwtVerify(secret, publicKey, { issuer: "TEAM123456", audience: "https://appleid.apple.com", subject: "org.peerfolio.app" })
  assert.ok(payload.exp! - payload.iat! <= 300)
})

test("authorization codes are exchanged and refresh tokens revoked through Apple's endpoints", async () => {
  const { config } = await appleConfig()
  const calls: { url: string; body: URLSearchParams }[] = []
  const ok: FetchLike = async (url, init) => {
    calls.push({ url, body: new URLSearchParams(init.body) })
    return { ok: true, status: 200, json: async () => ({ refresh_token: "r-abc" }) }
  }
  assert.equal(await exchangeAuthorizationCode(config, "code-1", ok), "r-abc")
  assert.equal(calls[0]!.url, "https://appleid.apple.com/auth/token")
  assert.equal(calls[0]!.body.get("grant_type"), "authorization_code")
  assert.equal(calls[0]!.body.get("code"), "code-1")
  assert.equal(await revokeRefreshToken(config, "r-abc", ok), true)
  assert.equal(calls[1]!.url, "https://appleid.apple.com/auth/revoke")
  assert.equal(calls[1]!.body.get("token"), "r-abc")
  assert.equal(calls[1]!.body.get("token_type_hint"), "refresh_token")

  const refuse: FetchLike = async () => ({ ok: false, status: 400, json: async () => ({ error: "invalid_grant" }) })
  assert.equal(await exchangeAuthorizationCode(config, "used", refuse), null)
  assert.equal(await revokeRefreshToken(config, "r", refuse), false)
})
