import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { connectionNotice, itemWebhookState } from "./plaid-status.ts"

describe("Plaid connection guidance", () => {
  it("instructs removal for unsupported currencies instead of waiting for sync", () => {
    const notice = connectionNotice({ status: "error", errorCode: "UNSUPPORTED_CURRENCY" })
    assert.match(notice.message, /USD/)
    assert.equal(notice.removeRequired, true)
    assert.equal(notice.tone, "error")
  })
  it("instructs removal for short positions instead of reauthentication", () => {
    const notice = connectionNotice({ status: "error", errorCode: "UNSUPPORTED_INVESTMENT_POSITION" })
    assert.match(notice.message, /short investment positions/)
    assert.equal(notice.removeRequired, true)
  })
  it("keeps temporary sync errors retryable and successful sync successful", () => {
    assert.deepEqual(connectionNotice({ status: "active" }), { message: "Account connected.", tone: "success", removeRequired: false })
    const pending = connectionNotice({ status: "error", errorCode: "PRODUCT_NOT_READY" })
    assert.equal(pending.removeRequired, false)
    assert.equal(pending.tone, "info")
    assert.match(pending.message, /refreshing/)
  })
  it("requires a new connection for revoked access, while login errors allow repair", () => {
    assert.equal(connectionNotice({ status: "disconnected" }).removeRequired, true)
    assert.equal(connectionNotice({ status: "needs_reauth" }).removeRequired, false)
  })
})

describe("Plaid Item webhook transitions", () => {
  it("never revives a disconnected item after a late error or pending webhook", () => {
    for (const code of ["ERROR", "PENDING_EXPIRATION", "PENDING_DISCONNECT", "USER_PERMISSION_REVOKED"]) {
      assert.equal(itemWebhookState("disconnected", code, "ITEM_LOGIN_REQUIRED"), null)
    }
  })
  it("marks permission revocation terminal and authentication errors repairable", () => {
    assert.deepEqual(itemWebhookState("active", "USER_PERMISSION_REVOKED"), { status: "disconnected", errorCode: "USER_PERMISSION_REVOKED" })
    assert.deepEqual(itemWebhookState("active", "ERROR", "ITEM_LOGIN_REQUIRED"), { status: "needs_reauth", errorCode: "ITEM_LOGIN_REQUIRED" })
    assert.deepEqual(itemWebhookState("active", "ERROR", "INTERNAL_SERVER_ERROR"), { status: "error", errorCode: "INTERNAL_SERVER_ERROR" })
  })
  it("ignores unrelated Item notifications", () => {
    assert.equal(itemWebhookState("active", "WEBHOOK_UPDATE_ACKNOWLEDGED"), null)
  })
})
