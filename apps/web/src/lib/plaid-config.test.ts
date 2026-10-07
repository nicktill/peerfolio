import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { plaidConfigured, plaidEnvironment } from "./plaid-config.ts"

describe("Plaid environment safety", () => {
  it("defaults to sandbox and selects production only explicitly", () => {
    assert.equal(plaidEnvironment(undefined), "sandbox")
    assert.equal(plaidEnvironment("sandbox"), "sandbox")
    assert.equal(plaidEnvironment("production"), "production")
  })
  it("rejects retired or mistyped environments", () => {
    for (const value of ["development", "prod", "Production", " production "]) {
      assert.throws(() => plaidEnvironment(value), /PLAID_ENV/)
    }
  })
  it("requires both credentials before enabling Link", () => {
    assert.equal(plaidConfigured({}), false)
    assert.equal(plaidConfigured({ PLAID_CLIENT_ID: "id" }), false)
    assert.equal(plaidConfigured({ PLAID_CLIENT_ID: "id", PLAID_SECRET: " " }), false)
    assert.equal(plaidConfigured({ PLAID_CLIENT_ID: "id", PLAID_SECRET: "secret" }), true)
  })
})
