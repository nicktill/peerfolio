import assert from "node:assert/strict"
import { test } from "node:test"
import { devLoginMode, passcodeMatches } from "./dev-login.ts"

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv
const SECRET = "a-long-enough-secret-123"

test("off unless explicitly enabled", () => {
  assert.equal(devLoginMode(env({ NODE_ENV: "development" })), "off")
})

test("local development needs only the flag", () => {
  assert.equal(devLoginMode(env({ ENABLE_DEV_LOGIN: "true", NODE_ENV: "development" })), "local")
})

test("a production build is off without a Vercel preview", () => {
  assert.equal(devLoginMode(env({ ENABLE_DEV_LOGIN: "true", NODE_ENV: "production" })), "off")
})

test("Vercel production can never enable it", () => {
  const vars = { ENABLE_DEV_LOGIN: "true", VERCEL_ENV: "production", NODE_ENV: "production", DEV_LOGIN_SECRET: SECRET, DEV_LOGIN_EMAILS: "a@b.co" }
  assert.equal(devLoginMode(env(vars)), "off")
})

test("a preview needs a long secret and an allowlist", () => {
  const base = { ENABLE_DEV_LOGIN: "true", VERCEL_ENV: "preview", NODE_ENV: "production" }
  assert.equal(devLoginMode(env(base)), "off")
  assert.equal(devLoginMode(env({ ...base, DEV_LOGIN_SECRET: SECRET })), "off")
  assert.equal(devLoginMode(env({ ...base, DEV_LOGIN_EMAILS: "a@b.co" })), "off")
  assert.equal(devLoginMode(env({ ...base, DEV_LOGIN_SECRET: "short", DEV_LOGIN_EMAILS: "a@b.co" })), "off")
  assert.equal(devLoginMode(env({ ...base, DEV_LOGIN_SECRET: SECRET, DEV_LOGIN_EMAILS: "a@b.co" })), "preview")
})

test("passcode comparison", () => {
  assert.equal(passcodeMatches(SECRET, env({ DEV_LOGIN_SECRET: SECRET })), true)
  assert.equal(passcodeMatches("wrong", env({ DEV_LOGIN_SECRET: SECRET })), false)
  assert.equal(passcodeMatches(undefined, env({ DEV_LOGIN_SECRET: SECRET })), false)
  assert.equal(passcodeMatches("", env({ DEV_LOGIN_SECRET: "" })), false)
})
