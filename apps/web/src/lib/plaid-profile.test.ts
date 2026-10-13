import assert from "node:assert/strict"
import { test } from "node:test"
import { decodePlaidToken, encodePlaidToken, newPlaidProfile, plaidCredentials } from "./plaid-profile.ts"

const env = { PLAID_ENV: "production", PLAID_CLIENT_ID: "paid-id", PLAID_SECRET: "paid-secret", PLAID_TRIAL_CLIENT_ID: "trial-id", PLAID_TRIAL_SECRET: "trial-secret" }

test("new production connections use only Trial credentials by default", () => {
  assert.equal(newPlaidProfile(env), "trial")
  assert.deepEqual(plaidCredentials(env, newPlaidProfile(env)), { clientId: "trial-id", secret: "trial-secret" })
})
test("missing Trial credentials never fall back to configured paid credentials", () => {
  assert.throws(() => plaidCredentials({ ...env, PLAID_TRIAL_SECRET: undefined }, newPlaidProfile(env)), /trial credentials/)
  assert.throws(() => plaidCredentials({ ...env, PLAID_TRIAL_CLIENT_ID: "" }, "trial"), /trial credentials/)
})
test("switching new connections to paid requires an explicit valid profile", () => {
  assert.equal(newPlaidProfile({ ...env, PLAID_CONNECTION_PROFILE: "paid" }), "paid")
  assert.throws(() => newPlaidProfile({ ...env, PLAID_CONNECTION_PROFILE: "typo" }), /must be/)
})
test("stored Item profile survives a later default change", () => {
  const stored = encodePlaidToken("access-test", "trial")
  assert.deepEqual(decodePlaidToken(stored), { profile: "trial", token: "access-test" })
  assert.equal(newPlaidProfile({ ...env, PLAID_CONNECTION_PROFILE: "paid" }), "paid")
  assert.equal(plaidCredentials(env, decodePlaidToken(stored).profile).clientId, "trial-id")
})
test("legacy Items remain on original credentials; malformed envelopes fail closed", () => {
  assert.deepEqual(decodePlaidToken("legacy-token"), { profile: "paid", token: "legacy-token" })
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
