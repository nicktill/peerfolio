import { afterEach, describe, it } from "node:test"
import assert from "node:assert/strict"
import { devLoginAllowed } from "./dev-login.ts"

const KEYS = ["ENABLE_DEV_LOGIN", "VERCEL_ENV", "NODE_ENV"] as const
const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]))
const env = process.env as Record<string, string | undefined>

function set(values: Partial<Record<(typeof KEYS)[number], string>>) {
  for (const k of KEYS) delete env[k]
  Object.assign(env, values)
}

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete env[k]
    else env[k] = saved[k]
  }
})

describe("devLoginAllowed", () => {
  it("is off without the opt-in flag, everywhere", () => {
    set({ NODE_ENV: "development" })
    assert.equal(devLoginAllowed(), false)
    set({ NODE_ENV: "production", VERCEL_ENV: "preview" })
    assert.equal(devLoginAllowed(), false)
  })

  it("is on for local development with the flag", () => {
    set({ NODE_ENV: "development", ENABLE_DEV_LOGIN: "true" })
    assert.equal(devLoginAllowed(), true)
  })

  it("is on for a Vercel preview build with the flag", () => {
    set({ NODE_ENV: "production", VERCEL_ENV: "preview", ENABLE_DEV_LOGIN: "true" })
    assert.equal(devLoginAllowed(), true)
  })

  it("is never on for a production deployment, flag or not", () => {
    set({ NODE_ENV: "production", VERCEL_ENV: "production", ENABLE_DEV_LOGIN: "true" })
    assert.equal(devLoginAllowed(), false)
    set({ NODE_ENV: "production", ENABLE_DEV_LOGIN: "true" })
    assert.equal(devLoginAllowed(), false)
  })
})
