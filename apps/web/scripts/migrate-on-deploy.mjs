// Applies pending database migrations during a Vercel *production* build.
//
// Migrations were a manual step, so a deploy could ship code that expects a table that
// isn't there yet. This runs the same migrations `npm run db:migrate` would, only for the
// production build, and never fails the build: if it can't run, the old schema stays and
// the app falls back where it was written to (see lib/plaid-switch.ts). Previews and local
// builds skip it, so a preview can never touch the production database.
import { readFileSync } from "node:fs"
import postgres from "postgres"
import { riskyStatement } from "./migration-safety.mjs"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"

if (process.env.VERCEL_ENV !== "production" || !process.env.DATABASE_URL) {
  console.log("[migrate] skipped (not a production build)")
  process.exit(0)
}

const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  // Only additive migrations run on their own. One that could lose data waits for a person.
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"))
  const applied = await client`select max(created_at)::bigint as last from drizzle.__drizzle_migrations`.catch(() => [{ last: 0 }])
  const lastApplied = Number(applied[0]?.last ?? 0)
  const pending = journal.entries.filter((entry) => entry.when > lastApplied)
  for (const entry of pending) {
    const risky = riskyStatement(readFileSync(`./drizzle/${entry.tag}.sql`, "utf8"))
    if (risky) {
      console.error(`[migrate] NOT applying: ${entry.tag} contains a statement that could lose data (${risky}). Run db:migrate yourself after checking a backup. Continuing the build.`)
      process.exit(0)
    }
  }
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  console.log("[migrate] database is up to date")
} catch (error) {
  console.error("[migrate] could not apply migrations; continuing the build:", error instanceof Error ? error.message : error)
} finally {
  await client.end({ timeout: 5 })
}
process.exit(0)
