import assert from "node:assert/strict"
import { test } from "node:test"
import { pausedByEnv, shutdownConfirmed, SHUTDOWN_PHRASE } from "./plaid-switch-core.ts"

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv

test("the shutdown needs the exact phrase", () => {
  assert.equal(shutdownConfirmed(SHUTDOWN_PHRASE), true)
  assert.equal(shutdownConfirmed(`  ${SHUTDOWN_PHRASE} `), true)
  assert.equal(shutdownConfirmed("disconnect everyone"), false)
  assert.equal(shutdownConfirmed(""), false)
  assert.equal(shutdownConfirmed(undefined), false)
  assert.equal(shutdownConfirmed(true), false)
})

test("the env switch pauses only when set to true", () => {
  assert.equal(pausedByEnv(env({})), false)
  assert.equal(pausedByEnv(env({ PLAID_KILL_SWITCH: "false" })), false)
  assert.equal(pausedByEnv(env({ PLAID_KILL_SWITCH: "true" })), true)
})
