/** Result used in records and filters. Cash-out remains a distinct stored ticket status. */
export function recordResult(pick: { status: string; stake: number; payout: number | null }): string {
  if (pick.status !== "cashed_out" || pick.payout == null) return pick.status
  return pick.payout >= pick.stake ? "won" : "lost"
}
