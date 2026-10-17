import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import { migrate } from "drizzle-orm/postgres-js/migrator"
const [url, folder] = process.argv.slice(2)
const client = postgres(url, { max: 1, onnotice: () => {} })
await migrate(drizzle(client), { migrationsFolder: folder })
await client.end()
console.log("migrated", folder)
