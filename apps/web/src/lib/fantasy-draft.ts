import "server-only"
import { and, eq, notInArray, sql } from "drizzle-orm"
import { db, fantasyDraftPicks, fantasyNotes } from "@web/db"
import { ApiError } from "@web/lib/api"
import { checkPicks, cleanNote, DEFAULT_PICKS } from "@web/lib/fantasy-season"
import { advanceLeague, latestSeason } from "@web/lib/fantasy-seasons"
import { requireFantasyMember } from "@web/lib/fantasy"
import { toMarketTicker } from "@web/lib/market-data"
import { ensurePriced } from "@web/lib/positions"

/**
 * Saves a player's stocks for the draft round that is open for picks. The
 * deadline is decided here, against the database clock, inside the same
 * transaction that writes the picks: a request that arrives after the lock
 * finds the round locked and is refused, whatever the browser's clock says.
 */
export async function saveDraftPicks(userId: string, leagueId: string, input: { tickers: string[]; notes?: Record<string, string> }) {
  const { member, league } = await requireFantasyMember(userId, leagueId)
  if (league.endsAt && league.endsAt.getTime() <= Date.now()) throw new ApiError("This league has finished", 409)
  await advanceLeague(leagueId)
  const season = await latestSeason(leagueId)
  if (!season || season.mode !== "draft" || season.status !== "active") throw new ApiError("There's no draft running in this league", 409)
  const slots = season.picksPerRound ?? DEFAULT_PICKS

  const check = checkPicks(input.tickers, slots)
  if (!check.ok) throw new ApiError(check.message, 422)

  // Outside the transaction: an unknown ticker calls the price providers to prove it exists.
  const resolved: { ticker: string; securityId: string }[] = []
  for (const symbol of check.tickers) {
    const market = toMarketTicker(symbol, "stock")
    if (!market) throw new ApiError(`${symbol} doesn't look like a ticker`, 422)
    const { securityId } = await ensurePriced(market, "stock")
    resolved.push({ ticker: symbol, securityId })
  }

  const noteFor = (ticker: string) => cleanNote(input.notes?.[ticker])

  return db.transaction(async (tx) => {
    // One save at a time per player, so two quick taps can't leave a mix of both lists.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${member.id}, 1))`)
    const [round] = await tx.execute<{ id: string; status: string; open: boolean }>(sql`
      SELECT r.id, r.status, (r.starts_at > now()) AS open
      FROM fantasy_rounds r
      WHERE r.season_id = ${season.id} AND r.status = 'open' AND r.starts_at > now()
      ORDER BY r.number LIMIT 1 FOR SHARE`)
    if (!round || !round.open) throw new ApiError("Picks are locked for this round", 409)

    const keep = resolved.map((r) => r.securityId)
    await tx.delete(fantasyDraftPicks).where(and(eq(fantasyDraftPicks.roundId, round.id), eq(fantasyDraftPicks.memberId, member.id), notInArray(fantasyDraftPicks.securityId, keep)))
    const saved: { id: string; ticker: string; slot: number }[] = []
    for (const [i, r] of resolved.entries()) {
      const [pick] = await tx
        .insert(fantasyDraftPicks)
        .values({ roundId: round.id, memberId: member.id, securityId: r.securityId, slot: i + 1 })
        .onConflictDoUpdate({ target: [fantasyDraftPicks.roundId, fantasyDraftPicks.memberId, fantasyDraftPicks.securityId], set: { slot: i + 1 } })
        .returning({ id: fantasyDraftPicks.id })
      saved.push({ id: pick!.id, ticker: r.ticker, slot: i + 1 })
      const note = noteFor(r.ticker)
      if (note) {
        await tx
          .insert(fantasyNotes)
          .values({ leagueId, memberId: member.id, pickId: pick!.id, body: note })
          .onConflictDoUpdate({ target: fantasyNotes.pickId, set: { body: note } })
      }
    }
    // First entry mark, so the pick has a price on file straight away.
    await tx.execute(sql`
      UPDATE fantasy_draft_picks p SET entry_price = s.close_price, entry_as_of = s.close_price_as_of
      FROM securities s WHERE p.security_id = s.id AND p.round_id = ${round.id} AND p.member_id = ${member.id}
        AND s.close_price IS NOT NULL AND s.close_price_final`)
    return { roundId: round.id, picks: saved }
  })
}
