import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import { after, before, beforeEach, describe, it } from "node:test"
import { eq, type SQL } from "drizzle-orm"
import { drizzle } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as schema from "../../db/schema.ts"
import { lockDueMarkets, type Db } from "./store.ts"

const url = process.env.PEERFOLIO_TEST_PG_URL
const namespace = `sports_lock_${process.pid}`
const now = new Date("2026-10-23T18:00:00Z")

describe("kickoff locking against Postgres", { skip: url ? false : "PEERFOLIO_TEST_PG_URL is not set" }, () => {
  let client: ReturnType<typeof postgres>
  let db: Db
  before(async () => {
    if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(url!).hostname)) throw new Error("This regression requires disposable local Postgres")
    client = postgres(url!, { max: 1, onnotice: () => {}, connection: { search_path: namespace } })
    await client.unsafe(`CREATE SCHEMA ${namespace}`)
    await client.unsafe(`CREATE TABLE ${namespace}.sports_markets (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid NOT NULL, market_key text NOT NULL,
      kind text NOT NULL, player text, stat_key text, status text NOT NULL DEFAULT 'open',
      lock_at timestamptz NOT NULL, books_used integer NOT NULL, void_reason text, fair_prob_a double precision,
      point_a double precision, frozen_reason text, repriced_at timestamptz, reprice_count integer NOT NULL DEFAULT 0,
      exchange_ok_at timestamptz, created_at timestamptz NOT NULL DEFAULT now())`)
    db = drizzle(client, { schema })
  })
  after(async () => {
    if (!client) return
    await client.unsafe(`DROP SCHEMA IF EXISTS ${namespace} CASCADE`)
    await client.end()
  })
  beforeEach(async () => { await client.unsafe(`TRUNCATE ${namespace}.sports_markets`) })
  const insert = async (lockAt = new Date(now.getTime() - 1), status = "open") => {
    const [row] = await db.insert(schema.sportsMarkets).values({ eventId: randomUUID(), marketKey: "h2h", kind: "moneyline", lockAt, status, booksUsed: 2 }).returning()
    return row!
  }

  it("locks due open markets once, excluding future and already terminal markets", async () => {
    const due = await insert()
    await insert(new Date(now.getTime() + 1))
    await insert(undefined, "settled")
    assert.equal(await lockDueMarkets(db, now), 1)
    assert.equal(await lockDueMarkets(db, now), 0)
    assert.equal((await db.select().from(schema.sportsMarkets).where(eq(schema.sportsMarkets.id, due.id)))[0]!.status, "locked")
  })

  for (const terminal of ["settled", "void"]) {
    it(`preserves a concurrent ${terminal} transition and reports only rows actually locked`, async () => {
      const raced = await insert()
      const other = await insert()
      // Deterministically place settlement between the real SELECT and the real UPDATE.
      const interleaved = {
        select: () => ({ from: () => ({ where: async (condition: SQL) => {
          const rows = await db.select().from(schema.sportsMarkets).where(condition)
          await db.update(schema.sportsMarkets).set({ status: terminal }).where(eq(schema.sportsMarkets.id, raced.id))
          return rows
        } }) }),
        update: db.update.bind(db),
      } as unknown as Db
      assert.equal(await lockDueMarkets(interleaved, now), 1)
      const rows = await db.select().from(schema.sportsMarkets)
      assert.equal(rows.find((row) => row.id === raced.id)!.status, terminal)
      assert.equal(rows.find((row) => row.id === other.id)!.status, "locked")
    })
  }
})
