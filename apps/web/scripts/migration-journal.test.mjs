import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import { test } from "node:test"
import { fileURLToPath } from "node:url"

const drizzle = path.join(path.dirname(fileURLToPath(import.meta.url)), "../drizzle")
const journal = JSON.parse(fs.readFileSync(path.join(drizzle, "meta/_journal.json"), "utf8"))

// drizzle only applies a migration whose `when` is later than the newest one already applied, so a migration merged
// "behind" a later timestamp is silently skipped on databases that already ran the later one.
test("journal idx and when strictly increase", () => {
  for (let i = 1; i < journal.entries.length; i++) {
    const prev = journal.entries[i - 1]
    const next = journal.entries[i]
    assert.ok(next.idx > prev.idx, `${next.tag}: idx ${next.idx} must exceed ${prev.tag}'s ${prev.idx}`)
    assert.ok(next.when > prev.when, `${next.tag}: when ${next.when} must exceed ${prev.tag}'s ${prev.when}, or drizzle skips it`)
  }
})

test("every journal entry has its SQL file and a matching tag number", () => {
  for (const entry of journal.entries) {
    assert.ok(fs.existsSync(path.join(drizzle, `${entry.tag}.sql`)), `${entry.tag}.sql is missing`)
    assert.match(entry.tag, /^\d{4}_/)
  }
})

test("the mobile auth migration sorts after every other migration", () => {
  const mobile = journal.entries.find((e) => e.tag.endsWith("_mobile_auth"))
  assert.ok(mobile)
  assert.equal(journal.entries.at(-1).tag, mobile.tag)
})
