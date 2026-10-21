/**
 * One member in one league only. Defaults to a dry run; does not load a production env file automatically.
 * DATABASE_URL=... node scripts/reset-sports-test-history.mjs --email EMAIL --league UUID
 * Apply after reviewing: add --apply --archive /absolute/private/path/reset.json
 * Archive contains the original member, picks, parlays/legs, ledger, attempts and notifications.
 * Refuses open positions. The archive is a snapshot; a failed commit leaves it on disk but rolls back all DB changes.
 */
import postgres from 'postgres'
import { parseArgs } from 'node:util'
import { isAbsolute, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { resetSportsTestHistory } from './lib/reset-sports-test-history.mjs'
const { values } = parseArgs({ options: { email: { type: 'string' }, league: { type: 'string' }, apply: { type: 'boolean', default: false }, archive: { type: 'string' } } })
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL explicitly')
if (values.apply && (!values.archive || !isAbsolute(values.archive))) throw new Error('Applying requires an absolute --archive path outside the repository')
if (values.archive) {
  const repo = fileURLToPath(new URL('../../../', import.meta.url))
  const rel = relative(repo, resolve(values.archive))
  if (!rel.startsWith('..' + '/') && rel !== '..') throw new Error('Archive must be saved outside the repository')
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false })
try { console.log(JSON.stringify(await resetSportsTestHistory(sql, { email: values.email, leagueId: values.league, apply: values.apply, archivePath: values.archive }), null, 2)) }
finally { await sql.end() }
