import assert from "node:assert/strict"
import { test } from "node:test"
import { riskyStatement } from "./migration-safety.mjs"

test("additive migrations pass", () => {
  assert.equal(riskyStatement('CREATE TABLE "app_settings" (\n"key" text PRIMARY KEY NOT NULL\n);'), null)
  assert.equal(riskyStatement('ALTER TABLE "users" ADD COLUMN "x" boolean DEFAULT false NOT NULL;'), null)
  assert.equal(riskyStatement('CREATE INDEX "i" ON "users" ("email");'), null)
})

test("destructive or rewriting statements are caught", () => {
  for (const sql of [
    'DROP TABLE "users";',
    'ALTER TABLE "users" DROP COLUMN "email";',
    'ALTER TABLE "users" RENAME COLUMN "a" TO "b";',
    'ALTER TABLE "users" ALTER COLUMN "a" SET DATA TYPE integer;',
    'TRUNCATE "users";',
    'DELETE FROM "users" WHERE 1=1;',
    'UPDATE "users" SET "a" = 1;',
  ]) assert.ok(riskyStatement(sql), sql)
})

test("comments do not trigger it", () => {
  assert.equal(riskyStatement('-- drop table later\nCREATE TABLE "t" ("a" text);'), null)
})

test("journal timestamps strictly increase with idx, so the migrator never skips a migration", async () => {
  const { readFileSync } = await import("node:fs")
  const { entries } = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"))
  for (let i = 1; i < entries.length; i++) {
    assert.ok(entries[i].idx > entries[i - 1].idx, `${entries[i].tag}: idx must increase`)
    assert.ok(entries[i].when > entries[i - 1].when, `${entries[i].tag}: when must be greater than ${entries[i - 1].tag} (drizzle skips anything not newer than the last applied)`)
  }
})
