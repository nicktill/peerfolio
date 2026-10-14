import assert from "node:assert/strict"
import { test } from "node:test"
import { decodePlaidToken, encodePlaidToken, newPlaidProfile, plaidCredentials } from "./plaid-profile.ts"

const env = { PLAID_ENV: "production", PLAID_CLIENT_ID: "paid-id", PLAID_SECRET: "paid-secret", PLAID_TRIAL_CLIENT_ID: "trial-id", PLAID_TRIAL_SECRET: "trial-secret" }

/** An env that records every key read, to prove which credential variables are touched. */
function spyEnv(values: Record<string, string | undefined>) {
  const reads: string[] = []
  return { reads, env: new Proxy(values, { get: (target, key) => (reads.push(String(key)), target[key as string]) }) }
}

test("profile unset means Trial in production and Sandbox elsewhere", () => {
  assert.equal(newPlaidProfile(env), "trial")
  assert.deepEqual(plaidCredentials(env, newPlaidProfile(env)), { clientId: "trial-id", secret: "trial-secret" })
  assert.equal(newPlaidProfile({ ...env, PLAID_ENV: undefined }), "sandbox")
  assert.equal(newPlaidProfile({ ...env, PLAID_ENV: "sandbox" }), "sandbox")
})
test("an explicit trial profile selects Trial", () => {
  assert.equal(newPlaidProfile({ ...env, PLAID_CONNECTION_PROFILE: "trial" }), "trial")
})
test("the paid profile is rejected no matter what the environment says", () => {
  for (const PLAID_ENV of ["production", "sandbox", undefined]) {
    assert.throws(() => newPlaidProfile({ ...env, PLAID_ENV, PLAID_CONNECTION_PROFILE: "paid" }), /code change/)
    assert.throws(() => plaidCredentials({ ...env, PLAID_ENV, PLAID_CONNECTION_PROFILE: "paid" }, "paid"), /Paid Plaid credentials are disabled/)
  }
})
test("typos and variants of the profile are rejected, not guessed", () => {
  for (const value of ["typo", "Trial", "TRIAL", " trial", "trial ", "Paid", "PAID", " paid", "", "sandbox"]) {
    assert.throws(() => newPlaidProfile({ ...env, PLAID_CONNECTION_PROFILE: value }), /must be trial|code change/, JSON.stringify(value))
  }
})
test("paid credentials are never read", () => {
  const paid = spyEnv({ ...env, PLAID_CONNECTION_PROFILE: "paid" })
  assert.throws(() => plaidCredentials(paid.env, "paid"))
  assert.throws(() => newPlaidProfile(paid.env))
  assert.ok(!paid.reads.includes("PLAID_SECRET"), "PLAID_SECRET must not be read for the paid profile")
  assert.ok(!paid.reads.includes("PLAID_CLIENT_ID"), "PLAID_CLIENT_ID must not be read for the paid profile")

  // In production no profile can ever return the paid values or read the paid secret.
  const trial = spyEnv(env)
  assert.deepEqual(plaidCredentials(trial.env, newPlaidProfile(trial.env)), { clientId: "trial-id", secret: "trial-secret" })
  assert.ok(!trial.reads.includes("PLAID_SECRET"), "PLAID_SECRET must not be read in Trial mode")
  assert.throws(() => plaidCredentials(env, "sandbox"), /PLAID_ENV=sandbox/)
})
test("missing Trial credentials never fall back to configured paid credentials", () => {
  assert.throws(() => plaidCredentials({ ...env, PLAID_TRIAL_SECRET: undefined }, newPlaidProfile(env)), /trial credentials/)
  assert.throws(() => plaidCredentials({ ...env, PLAID_TRIAL_CLIENT_ID: "" }, "trial"), /trial credentials/)
})
test("Sandbox needs a sandbox target and its own keys", () => {
  const sandbox = { PLAID_ENV: "sandbox", PLAID_CLIENT_ID: "sb-id", PLAID_SECRET: "sb-secret" }
  assert.deepEqual(plaidCredentials(sandbox, "sandbox"), { clientId: "sb-id", secret: "sb-secret" })
  assert.throws(() => plaidCredentials({ ...sandbox, PLAID_ENV: "Production" }, "sandbox"), /PLAID_ENV=sandbox/)
  assert.throws(() => plaidCredentials({ ...sandbox, PLAID_SECRET: "" }, "sandbox"), /not configured/)
})
test("stored Item profile survives a default change", () => {
  const stored = encodePlaidToken("access-test", "trial")
  assert.deepEqual(decodePlaidToken(stored, env), { profile: "trial", token: "access-test" })
  assert.equal(plaidCredentials(env, decodePlaidToken(stored, env).profile).clientId, "trial-id")
})
test("legacy untagged tokens are paid in production (blocked) and sandbox elsewhere; bad envelopes fail closed", () => {
  assert.deepEqual(decodePlaidToken("legacy-token", env), { profile: "paid", token: "legacy-token" })
  assert.throws(() => plaidCredentials(env, decodePlaidToken("legacy-token", env).profile), /Paid Plaid credentials are disabled/)
  assert.deepEqual(decodePlaidToken("legacy-token", { PLAID_ENV: "sandbox" }), { profile: "sandbox", token: "legacy-token" })
  assert.throws(() => decodePlaidToken('{"version":1,"profile":"other","token":"x"}'), /Invalid/)
  assert.throws(() => decodePlaidToken('{"version":1,"profile":"trial","token":""}'), /Invalid/)
  assert.throws(() => decodePlaidToken('{not-json'))
})
test("Trial cannot accidentally use the Sandbox API", () => {
  assert.throws(() => plaidCredentials({ ...env, PLAID_ENV: "sandbox" }, "trial"), /production/)
})
test("accidentally copying the paid team into Trial is rejected", () => {
  assert.throws(() => plaidCredentials({ ...env, PLAID_TRIAL_CLIENT_ID: env.PLAID_CLIENT_ID }, "trial"), /different Plaid team/)
})
