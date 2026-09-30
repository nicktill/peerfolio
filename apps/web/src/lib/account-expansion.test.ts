import assert from "node:assert/strict"
import { test } from "node:test"
import { reconcileAccountExpansion } from "./account-expansion.ts"

const account = (id: string, count: number) => ({ id, positions: Array.from({ length: count }) })

test("initial accounts use compact defaults without changing the caller's state", () => {
  const previous = {}
  assert.deepEqual(reconcileAccountExpansion(previous, [account("empty", 0), account("small", 5), account("large", 6)]), {
    empty: false, small: true, large: false,
  })
  assert.deepEqual(previous, {})
})

test("imports crossing the default collapse threshold and removals retain expansion", () => {
  const initial = reconcileAccountExpansion({}, [account("small", 5), account("large", 6)])
  assert.strictEqual(reconcileAccountExpansion(initial, [account("small", 20), account("large", 1)]), initial)
})

test("explicit toggles survive refreshes and only new accounts get defaults", () => {
  const chosen = { small: false, large: true }
  assert.deepEqual(reconcileAccountExpansion(chosen, [account("small", 2), account("large", 10), account("new", 3)]), {
    small: false, large: true, new: true,
  })
})

test("a created empty account stays open before and after the refreshed list arrives", () => {
  const pending = { created: true }
  assert.strictEqual(reconcileAccountExpansion(pending, []), pending)
  assert.strictEqual(reconcileAccountExpansion(pending, [account("created", 0)]), pending)
  assert.strictEqual(reconcileAccountExpansion(pending, [account("created", 30)]), pending)
})
