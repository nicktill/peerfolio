// Applies pending database migrations during a Vercel *production* build.
//
// Migrations were a manual step, so a deploy could ship code that expects a table that
// isn't there yet. This runs the same migrations `npm run db:migrate` would, only for the
// production build, and never fails the build: if it can't run, the old schema stays and
// the app falls back where it was written to (see lib/plaid-switch.ts). Previews and local
// builds skip it, so a preview can never touch the production database.
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"

if (process.env.VERCEL_ENV !== "production" || !process.env.DATABASE_URL) {
  console.log("[migrate] skipped (not a production build)")
  process.exit(0)
}

const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} })
try {
  await migrate(drizzle(client), { migrationsFolder: "./drizzle" })
  console.log("[migrate] database is up to date")
} catch (error) {
  console.error("[migrate] could not apply migrations; continuing the build:", error instanceof Error ? error.message : error)
} finally {
  await client.end({ timeout: 5 })
}
process.exit(0)
