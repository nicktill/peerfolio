/** Run after sports-betting-integration.mts against the same disposable LOCAL database. */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import postgres from 'postgres'
import { resetSportsTestHistory } from './lib/reset-sports-test-history.mjs'
const url = process.env.DATABASE_URL ?? ''
if (!/@(127\.0\.0\.1|localhost|\[::1\])[:/]/.test(url)) throw new Error('Local test database required')
const sql = postgres(url, { max: 1, prepare: false })
try {
 const [target] = await sql`SELECT m.id, m.league_id, m.user_id, u.email FROM sports_members m JOIN users u ON u.id=m.user_id
 JOIN sports_leagues l ON l.id=m.league_id WHERE l.name LIKE 'Betting IT %'
 AND EXISTS (SELECT 1 FROM sports_picks p WHERE p.member_id=m.id)
 AND NOT EXISTS (SELECT 1 FROM sports_picks p WHERE p.member_id=m.id AND p.status='open')
 AND NOT EXISTS (SELECT 1 FROM sports_parlays p WHERE p.member_id=m.id AND p.status='open') ORDER BY l.created_at DESC LIMIT 1`
 assert.ok(target, 'run the successful betting integration suite first')
 const opts = { email: target.email, leagueId: target.league_id }
 const others = async () => JSON.stringify(await sql`SELECT jsonb_build_object(
 'members',(SELECT jsonb_agg(to_jsonb(m) ORDER BY id) FROM sports_members m WHERE id != ${target.id}),
 'picks',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM sports_picks p WHERE member_id != ${target.id}),
 'parlays',(SELECT jsonb_agg(to_jsonb(p) ORDER BY id) FROM sports_parlays p WHERE member_id != ${target.id}),
 'ledger',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM sports_ledger l WHERE member_id != ${target.id}),
 'legs',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id) FROM sports_parlay_legs l WHERE parlay_id IN (SELECT id FROM sports_parlays WHERE member_id != ${target.id}))) AS records`)
 const otherBefore = await others()
 const [pick] = await sql`SELECT id, status FROM sports_picks WHERE member_id=${target.id} LIMIT 1`
 await sql`UPDATE sports_picks SET status='open' WHERE id=${pick.id}`
 await assert.rejects(resetSportsTestHistory(sql, opts), /open picks/)
 await sql`UPDATE sports_picks SET status=${pick.status} WHERE id=${pick.id}`
 const dry = await resetSportsTestHistory(sql, opts)
 assert.equal(dry.mode, 'dry-run'); assert.ok(dry.picks > 0)
 assert.equal((await sql`SELECT credits FROM sports_members WHERE id=${target.id}`)[0].credits, dry.creditsBefore)
 await assert.rejects(resetSportsTestHistory(sql, { ...opts, email: 'missing@example.test' }), /exactly one/)
 const archivePath = join(await mkdtemp(join(tmpdir(), 'sports-reset-it-')), 'archive.json')
 await assert.rejects(resetSportsTestHistory(sql, { ...opts, apply: true, archivePath: archivePath + '/missing' }))
 assert.equal((await sql`SELECT count(*)::int n FROM sports_picks WHERE member_id=${target.id}`)[0].n, dry.picks, 'archive failure rolls back')
 const result = await resetSportsTestHistory(sql, { ...opts, apply: true, archivePath })
 assert.equal((await sql`SELECT credits FROM sports_members WHERE id=${target.id}`)[0].credits, result.creditsAfter)
 assert.equal((await sql`SELECT count(*)::int n FROM sports_picks WHERE member_id=${target.id}`)[0].n, 0)
 assert.equal((await sql`SELECT count(*)::int n FROM sports_parlays WHERE member_id=${target.id}`)[0].n, 0)
 assert.equal(Number((await sql`SELECT sum(amount) n FROM sports_ledger WHERE member_id=${target.id}`)[0].n), result.creditsAfter)
 const archive = JSON.parse(await readFile(archivePath, 'utf8'))
 assert.equal(archive.picks.length, dry.picks); assert.equal(archive.parlays.length, dry.parlays)
 assert.equal(archive.member.id, target.id); assert.equal((await stat(archivePath)).mode & 0o777, 0o600)
 assert.equal(await others(), otherBefore, 'all other members balances, picks, parlays, legs and ledgers unchanged')
 await assert.rejects(resetSportsTestHistory(sql, { ...opts, apply: true, archivePath }), /EEXIST/)
 console.log('PASS: dry run, archive failure rollback, exact target, ledger balance, private archive, overwrite refusal, other-member isolation')
} finally { await sql.end() }
