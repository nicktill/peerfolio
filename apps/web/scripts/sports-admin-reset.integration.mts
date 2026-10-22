/** Run after sports-betting-integration.mts with the same disposable LOCAL database and a local dev server. */
import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import postgres from "postgres"
import { drizzle } from "drizzle-orm/postgres-js"
import * as schema from "../src/db/schema.ts"
import { resetSportsMember } from "../src/lib/sports/admin-reset.ts"
import { createSportsLeague } from "../src/lib/sports/store.ts"

const url = process.env.DATABASE_URL ?? ""
const origin = process.env.TEST_ORIGIN ?? "http://localhost:3117"
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url) || !["localhost", "127.0.0.1"].includes(new URL(origin).hostname)) throw new Error("Local database and server required")
const client = postgres(url, { max: 5, prepare: false, onnotice: () => {} })
const db = drizzle(client, { schema })
const check = (s: string) => console.log(`PASS: ${s}`)
try {
  const [admin] = await client`INSERT INTO users (email, name) VALUES ('sports-admin@example.test', 'Sports Admin') ON CONFLICT (email) DO UPDATE SET name = excluded.name RETURNING id`
  await client`INSERT INTO users (email, name) VALUES ('sports-member@example.test', 'Sports Member') ON CONFLICT (email) DO UPDATE SET name = excluded.name`
  const [target] = await client`SELECT m.*, u.email FROM sports_members m JOIN users u ON u.id = m.user_id JOIN sports_leagues l ON l.id = m.league_id
    WHERE l.name LIKE 'Betting IT %' AND EXISTS (SELECT 1 FROM sports_picks WHERE member_id = m.id)
    AND NOT EXISTS (SELECT 1 FROM sports_picks WHERE member_id = m.id AND status = 'open')
    AND NOT EXISTS (SELECT 1 FROM sports_parlays WHERE member_id = m.id AND status = 'open') ORDER BY l.created_at DESC LIMIT 1`
  assert.ok(target, "run betting suite first")
  // Same user in another league must remain unchanged, just like every other member.
  await createSportsLeague(db, target.user_id, { name: "Reset isolation sibling", emoji: "x", accent: "emerald", sports: ["nfl"], startingCredits: 10000, endsAt: null })
  const isolated = async () => JSON.stringify((await client`SELECT jsonb_build_object(
    'members', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_members m WHERE id != ${target.id}),
    'picks', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_picks m WHERE member_id != ${target.id}),
    'parlays', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_parlays m WHERE member_id != ${target.id}),
    'ledger', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_ledger m WHERE member_id != ${target.id}),
    'events', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_events m),
    'markets', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_markets m),
    'lines', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_lines m)) AS snapshot`)[0].snapshot)
  const before = await isolated()
  const opts = { memberId: target.id, requestId: randomUUID(), expectedCredits: target.credits }
  await assert.rejects(resetSportsMember(db, admin.id, { ...opts, expectedCredits: target.credits + 1 }), /Balance changed/)
  const [pick] = await client`SELECT id, status FROM sports_picks WHERE member_id = ${target.id} LIMIT 1`
  await client`UPDATE sports_picks SET status = 'open' WHERE id = ${pick.id}`
  await assert.rejects(resetSportsMember(db, admin.id, opts), /open picks/)
  await client`UPDATE sports_picks SET status = ${pick.status} WHERE id = ${pick.id}`
  check("changed balances and open positions are refused")
  // Force a failure AFTER deleting history; the transaction must restore everything, including the archive.
  const targetBefore = async () => JSON.stringify((await client`SELECT jsonb_build_object(
    'member', (SELECT to_jsonb(m) FROM sports_members m WHERE id = ${target.id}),
    'picks', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_picks m WHERE member_id = ${target.id}),
    'parlays', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_parlays m WHERE member_id = ${target.id}),
    'ledger', (SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_ledger m WHERE member_id = ${target.id})) AS snapshot`)[0].snapshot)
  const original = await targetBefore()
  await client`CREATE OR REPLACE FUNCTION qa_fail_admin_reset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.idempotency_key LIKE 'admin-reset:%' THEN RAISE EXCEPTION 'qa rollback'; END IF; RETURN NEW; END $$`
  await client`CREATE TRIGGER qa_admin_reset_failure BEFORE INSERT ON sports_ledger FOR EACH ROW EXECUTE FUNCTION qa_fail_admin_reset()`
  try { await assert.rejects(resetSportsMember(db, admin.id, opts), (error: unknown) => error instanceof Error && error.cause instanceof Error && error.cause.message.includes("qa rollback")) }
  finally { await client`DROP TRIGGER qa_admin_reset_failure ON sports_ledger`; await client`DROP FUNCTION qa_fail_admin_reset()` }
  assert.equal(await targetBefore(), original)
  assert.equal((await client`SELECT count(*)::int n FROM sports_member_resets WHERE member_id = ${target.id}`)[0].n, 0)
  check("failure after history removal rolls back cash, history, ledger and archive")

  async function login(email: string) {
    const jar = new Map<string, string>()
    const fetchAs = async (path: string, init: RequestInit = {}) => {
      const res = await fetch(origin + path, { ...init, redirect: "manual", headers: { Cookie: [...jar].map(([k,v]) => `${k}=${v}`).join("; "), ...init.headers } })
      for (const c of res.headers.getSetCookie()) { const kv = c.split(";", 1)[0]!; const i = kv.indexOf("="); jar.set(kv.slice(0,i), kv.slice(i+1)) }
      return res
    }
    const csrf = await (await fetchAs("/api/auth/csrf")).json()
    const res = await fetchAs("/api/auth/callback/dev-login", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Origin: origin }, body: new URLSearchParams({ csrfToken: csrf.csrfToken, email, json: "true", callbackUrl: origin + "/dashboard" }) })
    assert.ok(res.status === 200 || res.status === 302)
    const session = await (await fetchAs("/api/auth/session")).json()
    assert.equal(session.user?.email, email)
    return fetchAs
  }
  const endpoint = "/api/admin/sports/members"
  assert.equal((await fetch(origin + endpoint + "?userId=" + target.user_id)).status, 401)
  const userFetch = await login("sports-member@example.test")
  assert.equal((await userFetch(endpoint + "?userId=" + target.user_id)).status, 403)
  const body = { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(opts) }
  assert.equal((await userFetch(endpoint, body)).status, 403)
  const adminFetch = await login("sports-admin@example.test")
  assert.equal((await adminFetch(endpoint, { ...body, headers: { ...body.headers, Origin: "https://other.example.test" } })).status, 403)
  assert.equal((await adminFetch(endpoint, { ...body, body: JSON.stringify({ ...opts, userId: target.user_id }) })).status, 400)
  const listed = await (await adminFetch(endpoint + "?userId=" + target.user_id)).json()
  assert.ok(listed.members.some((m: {id: string}) => m.id === target.id))
  check("HTTP denies anonymous, non-admin, cross-origin and malformed resets; admin can list exact memberships")
  const results = await Promise.all([adminFetch(endpoint, body), adminFetch(endpoint, body)])
  assert.ok(results.every(r => r.status === 200), JSON.stringify(await Promise.all(results.filter(r=>r.status!==200).map(r=>r.text()))))
  const [a,b] = await Promise.all(results.map(r=>r.json()))
  assert.equal(a.resetId, b.resetId)
  const [archive] = await client`SELECT * FROM sports_member_resets WHERE id = ${a.resetId}`
  assert.equal(archive.actor_id, admin.id)
  assert.ok(archive.snapshot.picks.length > 0)
  assert.equal(archive.snapshot.member.credits, target.credits)
  assert.equal((await client`SELECT credits FROM sports_members WHERE id = ${target.id}`)[0].credits, a.credits)
  assert.equal((await client`SELECT count(*)::int n FROM sports_picks WHERE member_id = ${target.id}`)[0].n, 0)
  assert.equal((await client`SELECT count(*)::int n FROM sports_parlays WHERE member_id = ${target.id}`)[0].n, 0)
  assert.equal(Number((await client`SELECT sum(amount) n FROM sports_ledger WHERE member_id = ${target.id}`)[0].n), a.credits)
  assert.equal(await isolated(), before)
  check("concurrent HTTP resets apply once; archive preserves original data; cash equals ledger; all other members and shared games remain unchanged")
  // Leave a visible $10k membership for local UI verification.
  await createSportsLeague(db, admin.id, { name: "Sports reset QA", emoji: "x", accent: "emerald", sports: ["nfl"], startingCredits: 10000, endsAt: null })
  console.log("Sports admin reset integration: PASS")
} finally { await client.end() }
