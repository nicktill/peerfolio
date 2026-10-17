import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { parseSportsMode, sportsAllowed } from "./flag.ts"

describe("parseSportsMode", () => {
  it("1 is everyone, admin is admins only, anything else is off", () => {
    assert.equal(parseSportsMode("1"), "all")
    assert.equal(parseSportsMode("admin"), "admin")
    assert.equal(parseSportsMode(" Admin "), "admin")
    for (const v of [undefined, "", "0", "true", "yes", "administrator"]) assert.equal(parseSportsMode(v), "off")
  })
})

describe("sportsAllowed (the server gate)", () => {
  const isAdmin = async (id: string) => id === "admin-1"
  it("off blocks everyone, including admins", async () => {
    assert.equal(await sportsAllowed("off", "admin-1", isAdmin), false)
    assert.equal(await sportsAllowed("off", null, isAdmin), false)
  })
  it("1 allows everyone, signed in or not (existing behavior)", async () => {
    assert.equal(await sportsAllowed("all", "user-2", isAdmin), true)
    assert.equal(await sportsAllowed("all", null, isAdmin), true)
  })
  it("admin allows only a signed-in admin", async () => {
    assert.equal(await sportsAllowed("admin", "admin-1", isAdmin), true)
    assert.equal(await sportsAllowed("admin", "user-2", isAdmin), false)
    assert.equal(await sportsAllowed("admin", null, isAdmin), false)
  })
  it("admin mode never consults the admin lookup for a signed-out visitor", async () => {
    let calls = 0
    await sportsAllowed("admin", null, async () => (calls++, true))
    assert.equal(calls, 0)
  })
})
