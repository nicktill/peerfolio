import test from "node:test"
import assert from "node:assert/strict"
import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import { readMigrationFiles } from "drizzle-orm/migrator"
import nextConfig from "../next.config.ts"

const require = createRequire(import.meta.url)
// Use the same glob implementation as Next's build trace collector.
const glob = require("next/dist/compiled/glob")
const appRoot = fileURLToPath(new URL("../", import.meta.url))

test("auth's packaged migrations remain readable without schema snapshots", async () => {
  const patterns = nextConfig.outputFileTracingIncludes["/api/auth/*"]
  const files = [...new Set((await Promise.all(patterns.map((pattern) =>
    new Promise((resolve, reject) => glob(pattern, { cwd: appRoot, nodir: true },
      (error, matches) => error ? reject(error) : resolve(matches))),
  ))).flat())]
  assert.ok(files.includes("./drizzle/meta/_journal.json"))
  assert.ok(!files.some((file) => file.endsWith("_snapshot.json")))

  const dir = mkdtempSync(path.join(tmpdir(), "peerfolio-migration-bundle-"))
  try {
    for (const file of files) {
      const target = path.join(dir, file)
      mkdirSync(path.dirname(target), { recursive: true })
      copyFileSync(path.join(appRoot, file), target)
    }
    const expected = readMigrationFiles({ migrationsFolder: path.join(appRoot, "drizzle") })
    assert.ok(expected.length > 0)
    assert.deepEqual(readMigrationFiles({ migrationsFolder: path.join(dir, "drizzle") }), expected)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
