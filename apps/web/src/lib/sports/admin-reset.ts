import { sql } from "drizzle-orm"
import type { Db } from "./store.ts"
import { SportsError } from "./store.ts"

export type ResetRequest = { memberId: string; requestId: string; expectedCredits: number }

/** Caller must assert administrator access. One member lock serializes this with placements and settlements. */
export async function resetSportsMember(db: Db, actorId: string, input: ResetRequest) {
  return db.transaction(async tx => {
    const [member] = await tx.execute<{ id: string; user_id: string; league_id: string; credits: number; starting_credits: number }>(sql`
      SELECT m.*, l.starting_credits FROM sports_members m JOIN sports_leagues l ON l.id = m.league_id
      WHERE m.id = ${input.memberId} FOR UPDATE OF m`)
    if (!member) throw new SportsError("Sports league member not found", 404)
    const [prior] = await tx.execute<{ id: string; member_id: string; credits_after: number }>(sql`SELECT id, member_id, credits_after FROM sports_member_resets WHERE request_id = ${input.requestId}`)
    if (prior) {
      if (prior.member_id !== member.id) throw new SportsError("Reset request belongs to another member", 409)
      return { resetId: prior.id, credits: prior.credits_after }
    }
    if (member.credits !== input.expectedCredits) throw new SportsError("Balance changed. Refresh and review this member again.", 409)
    const [open] = await tx.execute<{ n: number }>(sql`SELECT (
      (SELECT count(*) FROM sports_picks WHERE member_id = ${member.id} AND status = 'open') +
      (SELECT count(*) FROM sports_parlays WHERE member_id = ${member.id} AND status = 'open'))::int AS n`)
    if (open!.n) throw new SportsError("Settle or cash out all open picks and parlays before resetting.", 409)
    // Archive inside the same transaction: a failed archive or any later statement rolls everything back.
    const [archive] = await tx.execute<{ id: string }>(sql`
      INSERT INTO sports_member_resets (member_id, actor_id, request_id, credits_before, credits_after, snapshot)
      SELECT ${member.id}, ${actorId}, ${input.requestId}, ${member.credits}, ${member.starting_credits}, jsonb_build_object(
        'version', 1, 'member', to_jsonb(m),
        'picks', (SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM sports_picks p WHERE p.member_id = m.id),
        'parlays', (SELECT coalesce(jsonb_agg(p), '[]'::jsonb) FROM sports_parlays p WHERE p.member_id = m.id),
        'legs', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM sports_parlay_legs x WHERE x.parlay_id IN (SELECT id FROM sports_parlays WHERE member_id = m.id)),
        'ledger', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM sports_ledger x WHERE x.member_id = m.id),
        'attempts', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM sports_live_tests x WHERE x.user_id = m.user_id AND x.league_id = m.league_id),
        'notifications', (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM sports_notifications x WHERE x.user_id = m.user_id AND
          (x.pick_id IN (SELECT id FROM sports_picks WHERE member_id = m.id) OR x.payload->>'parlayId' IN (SELECT id::text FROM sports_parlays WHERE member_id = m.id))))
      FROM sports_members m WHERE m.id = ${member.id} RETURNING id`)
    await tx.execute(sql`DELETE FROM sports_notifications WHERE user_id = ${member.user_id} AND
      (pick_id IN (SELECT id FROM sports_picks WHERE member_id = ${member.id}) OR payload->>'parlayId' IN (SELECT id::text FROM sports_parlays WHERE member_id = ${member.id}))`)
    await tx.execute(sql`DELETE FROM sports_live_tests WHERE user_id = ${member.user_id} AND league_id = ${member.league_id}`)
    await tx.execute(sql`DELETE FROM sports_ledger WHERE member_id = ${member.id}`)
    await tx.execute(sql`DELETE FROM sports_picks WHERE member_id = ${member.id}`)
    await tx.execute(sql`DELETE FROM sports_parlays WHERE member_id = ${member.id}`)
    await tx.execute(sql`UPDATE sports_members SET credits = ${member.starting_credits} WHERE id = ${member.id}`)
    await tx.execute(sql`INSERT INTO sports_ledger (member_id, type, amount, idempotency_key) VALUES (${member.id}, 'grant', ${member.starting_credits}, ${'admin-reset:' + archive!.id})`)
    return { resetId: archive!.id, credits: member.starting_credits }
  })
}
