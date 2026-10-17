import test from "node:test"
import assert from "node:assert/strict"
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { spawnSync } from "node:child_process"

// Run the real deployment entry point with inert DB modules; no database or credentials are used.
function run({ fail = false, unsafe = false, target = "production" } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "peerfolio-migrate-test-"))
  const put = (name, text) => { const path = join(dir, name); mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text) }
  try {
    put("package.json", '{"type":"module"}')
    put("migrate-on-deploy.mjs", readFileSync(new URL("./migrate-on-deploy.mjs", import.meta.url), "utf8"))
    put("migration-safety.mjs", readFileSync(new URL("./migration-safety.mjs", import.meta.url), "utf8"))
    put("node_modules/postgres/package.json", '{"type":"module","exports":"./index.js"}')
    put("node_modules/postgres/index.js", 'export default function(){const c=async()=>[{last:0}]; c.end=async()=>{}; return c}')
    put("node_modules/drizzle-orm/package.json", '{"type":"module","exports":{"./postgres-js":"./db.js","./postgres-js/migrator":"./migrator.js"}}')
    put("node_modules/drizzle-orm/db.js", 'export const drizzle=()=>({})')
    put("node_modules/drizzle-orm/migrator.js", fail ? 'export async function migrate(){throw new Error("injected migration failure")}' : 'export async function migrate(){}')
    put("drizzle/meta/_journal.json", JSON.stringify({ entries: unsafe ? [{ when: 1, tag: "0001_unsafe" }] : [] }))
    if (unsafe) put("drizzle/0001_unsafe.sql", "DROP TABLE accounts;")
    return spawnSync(process.execPath, ["migrate-on-deploy.mjs"], { cwd: dir, encoding: "utf8", env: { PATH: process.env.PATH, VERCEL_ENV: target, DATABASE_URL: "postgres://unused.invalid/test" } })
  } finally { rmSync(dir, { recursive: true, force: true }) }
}

test("a successful migration permits deployment", () => assert.equal(run().status, 0))
test("a failed migration blocks deployment", () => { const result = run({ fail: true }); assert.equal(result.status, 1); assert.match(result.stderr, /injected migration failure/) })
test("an unsafe pending migration blocks deployment", () => { const result = run({ unsafe: true }); assert.equal(result.status, 1); assert.match(result.stderr, /could lose data/) })
test("preview builds skip database migrations", () => { const result = run({ fail: true, target: "preview" }); assert.equal(result.status, 0); assert.match(result.stdout, /skipped/) })
