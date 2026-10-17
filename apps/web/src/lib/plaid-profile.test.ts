import assert from "node:assert/strict"
import { test } from "node:test"
import { decodePlaidToken, encodePlaidToken, maskClientId, newPlaidProfile, plaidCredentials, trial2Configured, trialCredentialSummary } from "./plaid-profile.ts"

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

const env2 = { ...env, PLAID_TRIAL2_CLIENT_ID: "trial2-id-0123456789", PLAID_TRIAL2_SECRET: "trial2-secret-xyz" }

test("trial2 is never chosen by configuration, only by the budget logic", () => {
  assert.equal(newPlaidProfile(env2), "trial")
  assert.throws(() => newPlaidProfile({ ...env2, PLAID_CONNECTION_PROFILE: "trial2" }), /must be trial/)
})
test("trial2 reads its own credentials, never the Trial or paid pair", () => {
  const spy = spyEnv(env2)
  assert.deepEqual(plaidCredentials(spy.env, "trial2"), { clientId: "trial2-id-0123456789", secret: "trial2-secret-xyz" })
  assert.ok(!spy.reads.includes("PLAID_SECRET"), "paid secret must not be read")
  assert.equal(trial2Configured(env2), true)
})
test("trial2 needs production, its own credentials, and a different team from Trial and paid", () => {
  assert.throws(() => plaidCredentials({ ...env2, PLAID_ENV: "sandbox" }, "trial2"), /PLAID_ENV=production/)
  assert.throws(() => plaidCredentials({ ...env2, PLAID_TRIAL2_SECRET: "" }, "trial2"), /trial2 credentials/)
  assert.throws(() => plaidCredentials({ ...env2, PLAID_TRIAL2_CLIENT_ID: "trial-id" }, "trial2"), /different Plaid team from Trial/)
  assert.throws(() => plaidCredentials({ ...env2, PLAID_TRIAL2_CLIENT_ID: "paid-id" }, "trial2"), /different Plaid team from paid/)
  assert.equal(trial2Configured({ ...env2, PLAID_TRIAL2_CLIENT_ID: undefined }), false)
  assert.equal(trial2Configured({ ...env2, PLAID_ENV: "sandbox" }), false)
})
test("paid stays disabled with both Trial pools configured", () => {
  assert.throws(() => plaidCredentials(env2, "paid"), /Paid Plaid credentials are disabled/)
})
test("stored trial2 tokens round-trip and select the trial2 credentials", () => {
  const stored = encodePlaidToken("access-t2", "trial2")
  const decoded = decodePlaidToken(stored, env2)
  assert.deepEqual(decoded, { profile: "trial2", token: "access-t2" })
  assert.equal(plaidCredentials(env2, decoded.profile).clientId, "trial2-id-0123456789")
  assert.throws(() => decodePlaidToken(JSON.stringify({ version: 1, profile: "trial3", token: "x" }), env2), /Invalid stored/)
})
test("masked client ids reveal at most 8 characters and never the secret", () => {
  assert.equal(maskClientId("1a2b3c4d5e6f7g8h9z8y"), "1a2b…9z8y")
  for (const id of ["", "abc", "12345678", "12345678901", "1234567890123456789012345678"]) {
    const masked = maskClientId(id)
    assert.ok(masked.replace("…", "").length <= 8, `${id} -> ${masked}`)
  }
  assert.equal(maskClientId("short-id"), "••••")
  const summary = trialCredentialSummary(env2)
  const json = JSON.stringify(summary)
  for (const secret of ["trial2-secret-xyz", "trial-secret", "paid-secret", "paid-id", "paid"]) assert.ok(!json.includes(secret), secret)
  assert.deepEqual(summary.map((s) => s.configured), [true, true])
  assert.equal(summary[1]!.clientId, "tria…6789")
})
test("a missing pool reports nothing about credentials", () => {
  const [one, two] = trialCredentialSummary(env)
  assert.equal(one!.configured, true)
  assert.deepEqual(two, { pool: 2, profile: "trial2", configured: false })
})
