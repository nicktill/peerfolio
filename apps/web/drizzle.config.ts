import { config } from "dotenv"
import type { Config } from "drizzle-kit"

// Next loads .env.local automatically; drizzle-kit does not, so load it here or
// every db:* script fails with an empty url.
config({ path: ".env.local" })
config({ path: ".env" })

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
} satisfies Config
