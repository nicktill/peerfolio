import { open } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'

/** Explicitly scoped maintenance operation. No league-wide reset and no shared game/market edits. */
export async function resetSportsTestHistory(sql, { email, leagueId, apply = false, archivePath }) {
  if (!email || !/^[^@\s]+@[^@\s]+$/.test(email) || !/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(leagueId ?? '')) throw new Error('An exact email and league UUID are required')
  if (apply && !archivePath) throw new Error('--archive is required when applying a reset')
  return sql.begin(async tx => {
    const members = await tx`
      SELECT m.*, l.starting_credits FROM sports_members m
      JOIN users u ON u.id = m.user_id JOIN sports_leagues l ON l.id = m.league_id
      WHERE u.email = ${email} AND m.league_id = ${leagueId} FOR UPDATE OF m`
    if (members.length !== 1) throw new Error('Expected exactly one matching league member; nothing changed')
    const member = members[0]
    const picks = await tx`SELECT * FROM sports_picks WHERE member_id = ${member.id} ORDER BY id`
    const parlays = await tx`SELECT * FROM sports_parlays WHERE member_id = ${member.id} ORDER BY id`
    if ([...picks, ...parlays].some(p => p.status === 'open')) throw new Error('Cash out or settle open picks and parlays before resetting; nothing changed')
    const summary = { mode: apply ? 'applied' : 'dry-run', memberId: member.id, leagueId, picks: picks.length, parlays: parlays.length, creditsBefore: member.credits, creditsAfter: member.starting_credits }
    if (!apply) return summary
    const legs = await tx`SELECT * FROM sports_parlay_legs WHERE parlay_id IN (SELECT id FROM sports_parlays WHERE member_id = ${member.id}) ORDER BY id`
    const ledger = await tx`SELECT * FROM sports_ledger WHERE member_id = ${member.id} ORDER BY id`
    const attempts = await tx`SELECT * FROM sports_live_tests WHERE user_id = ${member.user_id} AND league_id = ${leagueId} ORDER BY id`
    const notifications = await tx`SELECT * FROM sports_notifications WHERE user_id = ${member.user_id} AND
      (pick_id IN (SELECT id FROM sports_picks WHERE member_id = ${member.id}) OR
       payload->>'parlayId' IN (SELECT id::text FROM sports_parlays WHERE member_id = ${member.id})) ORDER BY id`
    const resetId = randomUUID()
    // Exclusive creation: never overwrite an earlier archive. Sync to disk BEFORE changing any rows.
    const file = await open(archivePath, 'wx', 0o600)
    try {
      await file.writeFile(JSON.stringify({ version: 1, resetId, archivedAt: new Date().toISOString(), summary, member, picks, parlays, legs, ledger, attempts, notifications }, null, 2) + '\n')
      await file.sync()
    } finally { await file.close() }
    await tx`DELETE FROM sports_notifications WHERE user_id = ${member.user_id} AND
      (pick_id IN (SELECT id FROM sports_picks WHERE member_id = ${member.id}) OR
       payload->>'parlayId' IN (SELECT id::text FROM sports_parlays WHERE member_id = ${member.id}))`
    await tx`DELETE FROM sports_live_tests WHERE user_id = ${member.user_id} AND league_id = ${leagueId}`
    await tx`DELETE FROM sports_ledger WHERE member_id = ${member.id}`
    await tx`DELETE FROM sports_picks WHERE member_id = ${member.id}`
    await tx`DELETE FROM sports_parlays WHERE member_id = ${member.id}`
    await tx`UPDATE sports_members SET credits = ${member.starting_credits} WHERE id = ${member.id}`
    await tx`INSERT INTO sports_ledger (member_id, type, amount, idempotency_key)
      VALUES (${member.id}, 'grant', ${member.starting_credits}, ${'test-reset:' + resetId})`
    return { ...summary, resetId, archivePath }
  })
}
