import assert from "node:assert/strict"
import { createHash } from "node:crypto"
import { test } from "node:test"
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose"
import {
  IdentityError,
  bearerToken,
  hashRefreshToken,
  identityAudiences,
  issueSession,
  mobileAuthConfig,
  rotateRefreshToken,
  revokeRefreshToken,
  signAccessToken,
  verifyAccessToken,
  verifyIdentityToken,
  type RefreshRecord,
  type RefreshStore,
} from "./mobile-auth-core.ts"

const SECRET = "a-very-long-secret-for-tests-0123456789"
const USER = "11111111-2222-3333-4444-555555555555"
const config = mobileAuthConfig({ MOBILE_AUTH_SECRET: SECRET })!

function memoryStore(): RefreshStore & { rows: RefreshRecord[] } {
  const rows: RefreshRecord[] = []
  return {
    rows,
    async insert(r) {
      rows.push({ ...r, id: `id${rows.length}`, usedAt: null, revokedAt: null })
    },
    async findByHash(h) {
      return rows.find((r) => r.tokenHash === h) ?? null
    },
    async markUsed(id, at) {
      const row = rows.find((r) => r.id === id)!
      if (row.usedAt) return false
      row.usedAt = at
      return true
    },
    async revokeFamily(f, at) {
      for (const r of rows) if (r.familyId === f && !r.revokedAt) r.revokedAt = at
    },
  }
}

test("config is off without a long enough secret", () => {
  assert.equal(mobileAuthConfig({}), null)
  assert.equal(mobileAuthConfig({ MOBILE_AUTH_SECRET: "short" }), null)
  assert.equal(mobileAuthConfig({ MOBILE_AUTH_SECRET: SECRET, MOBILE_ACCESS_TTL_SECONDS: "60" })!.accessTtlSec, 60)
  assert.equal(mobileAuthConfig({ MOBILE_AUTH_SECRET: SECRET, MOBILE_ACCESS_TTL_SECONDS: "nope" })!.accessTtlSec, 900)
})

test("bearerToken reads only a well-formed Bearer header", () => {
  assert.equal(bearerToken("Bearer abc.def"), "abc.def")
  assert.equal(bearerToken("bearer abc"), "abc")
  assert.equal(bearerToken("Basic abc"), null)
  assert.equal(bearerToken("Bearer"), null)
  assert.equal(bearerToken(null), null)
})

test("an access token round-trips and expires", async () => {
  const now = new Date("2026-01-01T00:00:00Z")
  const { token, expiresIn } = await signAccessToken(USER, config, now)
  assert.equal(expiresIn, 900)
  assert.equal(await verifyAccessToken(token, config, now), USER)
  assert.equal(await verifyAccessToken(token, config, new Date(now.getTime() + 899_000)), USER)
  assert.equal(await verifyAccessToken(token, config, new Date(now.getTime() + 901_000)), null)
})

test("an access token signed with another secret, or garbage, is rejected", async () => {
  const other = mobileAuthConfig({ MOBILE_AUTH_SECRET: "another-very-long-secret-for-tests-9876543210" })!
  const { token } = await signAccessToken(USER, other)
  assert.equal(await verifyAccessToken(token, config), null)
  assert.equal(await verifyAccessToken("nonsense", config), null)
})

test("a token that is not an access token for this app is rejected", async () => {
  const forge = (claims: Record<string, unknown>, aud = "peerfolio-mobile") =>
    new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).setIssuer("peerfolio").setAudience(aud).setSubject(USER).setExpirationTime("5m").sign(config.secret)
  assert.equal(await verifyAccessToken(await forge({}), config), null)
  assert.equal(await verifyAccessToken(await forge({ use: "access" }, "someone-else"), config), null)
  assert.equal(await verifyAccessToken(await forge({ use: "access" }), config), USER)
})

test("refresh rotates, and each token works once", async () => {
  const store = memoryStore()
  const first = await issueSession(store, config, USER)
  assert.equal(store.rows.length, 1)
  assert.notEqual(store.rows[0]!.tokenHash, first.refreshToken, "only a hash is stored")
  assert.equal(store.rows[0]!.tokenHash, hashRefreshToken(first.refreshToken))

  const second = await rotateRefreshToken(store, config, first.refreshToken)
  assert.ok(second.ok)
  if (!second.ok) return
  assert.equal(second.userId, USER)
  assert.notEqual(second.session.refreshToken, first.refreshToken)
  assert.equal(store.rows[1]!.familyId, store.rows[0]!.familyId)
  assert.equal(await verifyAccessToken(second.session.accessToken, config), USER)
})

test("replaying a used refresh token revokes the whole family", async () => {
  const store = memoryStore()
  const first = await issueSession(store, config, USER)
  const second = await rotateRefreshToken(store, config, first.refreshToken)
  assert.ok(second.ok)
  const replay = await rotateRefreshToken(store, config, first.refreshToken)
  assert.deepEqual(replay, { ok: false, reason: "reuse" })
  if (!second.ok) return
  assert.deepEqual(await rotateRefreshToken(store, config, second.session.refreshToken), { ok: false, reason: "invalid" })
})

test("unknown and expired refresh tokens are refused", async () => {
  const store = memoryStore()
  assert.deepEqual(await rotateRefreshToken(store, config, "pfr_unknown"), { ok: false, reason: "invalid" })
  const now = new Date("2026-01-01T00:00:00Z")
  const session = await issueSession(store, config, USER, undefined, now)
  const later = new Date(now.getTime() + (config.refreshTtlSec + 1) * 1000)
  assert.deepEqual(await rotateRefreshToken(store, config, session.refreshToken, later), { ok: false, reason: "expired" })
})

test("logout revokes the family and is safe to repeat", async () => {
  const store = memoryStore()
  const session = await issueSession(store, config, USER)
  await revokeRefreshToken(store, session.refreshToken)
  await revokeRefreshToken(store, session.refreshToken)
  await revokeRefreshToken(store, "pfr_unknown")
  assert.deepEqual(await rotateRefreshToken(store, config, session.refreshToken), { ok: false, reason: "invalid" })
})

test("audiences come from the environment", () => {
  assert.deepEqual(identityAudiences("apple", {}), [])
  assert.deepEqual(identityAudiences("apple", { APPLE_BUNDLE_ID: "org.peerfolio.app, org.peerfolio.dev" }), ["org.peerfolio.app", "org.peerfolio.dev"])
  assert.deepEqual(identityAudiences("google", { GOOGLE_IOS_CLIENT_ID: "ios", GOOGLE_CLIENT_ID: "web" }), ["ios", "web"])
})

async function idTokenFixture() {
  const { publicKey, privateKey } = await generateKeyPair("RS256")
  const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256", use: "sig" }
  const keys = createLocalJWKSet({ keys: [jwk] })
  const sign = (claims: Record<string, unknown>, o: { iss?: string; aud?: string; exp?: string } = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(o.iss ?? "https://appleid.apple.com")
      .setAudience(o.aud ?? "org.peerfolio.app")
      .setSubject("apple-sub-1")
      .setIssuedAt()
      .setExpirationTime(o.exp ?? "10m")
      .sign(privateKey)
  return { keys, sign }
}

test("a valid Apple token yields an identity, matching the hashed nonce", async () => {
  const { keys, sign } = await idTokenFixture()
  const nonce = "raw-nonce-123456"
  const hashed = createHash("sha256").update(nonce).digest("hex")
  const token = await sign({ nonce: hashed, email: "Me@Example.com", email_verified: "true" })
  const identity = await verifyIdentityToken("apple", token, nonce, { audiences: ["org.peerfolio.app"], keys })
  assert.deepEqual(identity, { provider: "apple", subject: "apple-sub-1", email: "me@example.com", emailVerified: true, name: null, image: null })
})

test("a Google token with a raw nonce and profile claims is accepted", async () => {
  const { keys, sign } = await idTokenFixture()
  const token = await sign({ nonce: "raw-nonce-123456", email: "a@b.co", email_verified: true, name: "Ada", picture: "https://x/y.png" }, { iss: "accounts.google.com", aud: "ios-client" })
  const identity = await verifyIdentityToken("google", token, "raw-nonce-123456", { audiences: ["ios-client"], keys })
  assert.equal(identity.name, "Ada")
  assert.equal(identity.emailVerified, true)
})

test("identity tokens with a wrong nonce, audience, issuer, or expiry are refused", async () => {
  const { keys, sign } = await idTokenFixture()
  const nonce = "raw-nonce-123456"
  const good = { nonce, email: "a@b.co", email_verified: true }
  const opts = { audiences: ["org.peerfolio.app"], keys }
  await assert.rejects(verifyIdentityToken("apple", await sign(good), "different-nonce", opts), IdentityError)
  await assert.rejects(verifyIdentityToken("apple", await sign(good, { aud: "other.app" }), nonce, opts), IdentityError)
  await assert.rejects(verifyIdentityToken("apple", await sign(good, { iss: "https://evil.example" }), nonce, opts), IdentityError)
  await assert.rejects(verifyIdentityToken("apple", await sign(good, { exp: "-1m" }), nonce, opts), IdentityError)
  await assert.rejects(verifyIdentityToken("apple", await sign(good), nonce, { audiences: [], keys }), IdentityError)
  await assert.rejects(verifyIdentityToken("apple", await sign(good), "", opts), IdentityError)
})

test("a token signed by an unknown key is refused", async () => {
  const { sign } = await idTokenFixture()
  const other = await idTokenFixture()
  await assert.rejects(verifyIdentityToken("apple", await sign({ nonce: "raw-nonce-123456" }), "raw-nonce-123456", { audiences: ["org.peerfolio.app"], keys: other.keys }), IdentityError)
})
