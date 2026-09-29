/**
 * Trading rules for fantasy leagues, as plain functions over numbers.
 *
 * Free of database imports so the tests can run them directly. The database
 * layer loads the member's state under a row lock, asks these functions
 * whether the trade is allowed and what it changes, then writes the result.
 */

export type Holding = { securityId: string; shares: number; costBasis: number; price: number }

export type MemberState = { cash: number; positions: Holding[] }

export type TradeRequest =
  | { side: "buy"; securityId: string; price: number; amount: number }
  | { side: "sell"; securityId: string; price: number; shares: number | "all" }

export type TradeOutcome = {
  shares: number
  cashDelta: number
  position: { shares: number; costBasis: number } | null
}

export class TradeRejected extends Error {}

/** Smallest trade worth recording: a cent of cash or a hundred-millionth of a share. */
const MIN_CASH = 0.01
const MIN_SHARES = 1e-8

export const portfolioValue = (state: MemberState) =>
  state.cash + state.positions.reduce((sum, p) => sum + p.shares * p.price, 0)

/** Return in percent against the league's starting cash. */
export const returnPct = (value: number, startingCash: number) => {
  // Persisted share precision can introduce sub-cent valuation noise after a fill.
  const gain = Math.round((value - startingCash) * 100) / 100
  return gain === 0 ? 0 : (gain / startingCash) * 100
}

/**
 * What gets written to the database for a trade: fixed precision, as strings.
 * `placeTrade` and the tests both go through this, so the tests exercise the
 * same rounding production does.
 */
export function roundForStorage(outcome: TradeOutcome) {
  return {
    cashDelta: outcome.cashDelta.toFixed(6),
    shares: outcome.shares.toFixed(8),
    position: outcome.position
      ? { shares: outcome.position.shares.toFixed(8), costBasis: outcome.position.costBasis.toFixed(6) }
      : null,
  }
}

/** The member's state after a trade, exactly as the database will hold it. */
export function applyStored(state: MemberState, securityId: string, price: number, outcome: TradeOutcome): MemberState {
  const stored = roundForStorage(outcome)
  const others = state.positions.filter((p) => p.securityId !== securityId)
  const position = stored.position
    ? [{ securityId, shares: Number(stored.position.shares), costBasis: Number(stored.position.costBasis), price }]
    : []
  return { cash: Number((state.cash + Number(stored.cashDelta)).toFixed(6)), positions: [...others, ...position] }
}

export type TradeRecord = { securityId: string; side: "buy" | "sell"; shares: number; price: number }

/**
 * Rebuilds a member's cash and positions from nothing but their starting cash
 * and their trade log. If this disagrees with what is stored, something wrote
 * the wrong number somewhere.
 */
export function replayLedger(startingCash: number, trades: TradeRecord[]) {
  let cash = startingCash
  const positions = new Map<string, { shares: number; costBasis: number }>()
  for (const t of trades) {
    const held = positions.get(t.securityId) ?? { shares: 0, costBasis: 0 }
    const value = t.shares * t.price
    if (t.side === "buy") {
      cash -= value
      positions.set(t.securityId, { shares: held.shares + t.shares, costBasis: held.costBasis + value })
    } else {
      cash += value
      const remaining = held.shares - t.shares
      positions.set(t.securityId, {
        shares: remaining,
        costBasis: held.shares > 0 ? held.costBasis * (remaining / held.shares) : 0,
      })
    }
  }
  for (const [id, p] of positions) if (p.shares < 1e-6) positions.delete(id)
  return { cash, positions }
}

export type LedgerMismatch = { kind: "cash" | "shares" | "cost_basis" | "unexpected_position" | "missing_position"; securityId?: string; expected: number; actual: number }

/** Differences between a stored member and their replayed trade log, beyond rounding noise. */
export function findLedgerMismatches(
  stored: { cash: number; positions: { securityId: string; shares: number; costBasis: number }[] },
  replayed: ReturnType<typeof replayLedger>,
): LedgerMismatch[] {
  const out: LedgerMismatch[] = []
  if (Math.abs(stored.cash - replayed.cash) > 0.01) out.push({ kind: "cash", expected: replayed.cash, actual: stored.cash })

  const seen = new Set<string>()
  for (const p of stored.positions) {
    seen.add(p.securityId)
    const expected = replayed.positions.get(p.securityId)
    if (!expected) {
      out.push({ kind: "unexpected_position", securityId: p.securityId, expected: 0, actual: p.shares })
      continue
    }
    // Shares are stored to 8 places; allow a millionth of a share of drift.
    if (Math.abs(p.shares - expected.shares) > 1e-6) out.push({ kind: "shares", securityId: p.securityId, expected: expected.shares, actual: p.shares })
    if (Math.abs(p.costBasis - expected.costBasis) > 0.01) out.push({ kind: "cost_basis", securityId: p.securityId, expected: expected.costBasis, actual: p.costBasis })
  }
  for (const [securityId, p] of replayed.positions) {
    if (!seen.has(securityId)) out.push({ kind: "missing_position", securityId, expected: p.shares, actual: 0 })
  }
  return out
}

/** The race chart line: everyone starts at 100, the last point is the live value. */
export function raceSeries(pastValues: number[], liveValue: number, startingCash: number): number[] {
  return [100, ...pastValues.map((v) => 100 + returnPct(v, startingCash)), 100 + returnPct(liveValue, startingCash)]
}

export function isClosed(endsAt: Date | null, now = new Date()) {
  return endsAt !== null && endsAt.getTime() <= now.getTime()
}

/**
 * Validates a trade and works out what it changes. Throws {@link TradeRejected}
 * with a message fit to show the person.
 */
export function applyTrade(state: MemberState, trade: TradeRequest, rules: { maxPositionPct: number | null }): TradeOutcome {
  if (!(trade.price > 0)) throw new TradeRejected("No price for that ticker yet")
  const held = state.positions.find((p) => p.securityId === trade.securityId)

  if (trade.side === "buy") {
    if (!(trade.amount >= MIN_CASH)) throw new TradeRejected("Enter an amount to buy")
    if (trade.amount > state.cash + 1e-6) throw new TradeRejected("Not enough cash for that")

    const shares = trade.amount / trade.price
    const nextShares = (held?.shares ?? 0) + shares

    if (rules.maxPositionPct !== null) {
      // Total value doesn't change on a buy (cash becomes shares), so the cap is
      // measured against the current total.
      const total = portfolioValue(state)
      const weight = ((nextShares * trade.price) / total) * 100
      if (weight > rules.maxPositionPct + 1e-9) {
        throw new TradeRejected(`This league caps any one pick at ${rules.maxPositionPct}% of your portfolio`)
      }
    }

    return {
      shares,
      cashDelta: -trade.amount,
      position: { shares: nextShares, costBasis: (held?.costBasis ?? 0) + trade.amount },
    }
  }

  if (!held || held.shares < MIN_SHARES) throw new TradeRejected("You don't own any of that")
  const shares = trade.shares === "all" ? held.shares : trade.shares
  if (!(shares >= MIN_SHARES)) throw new TradeRejected("Enter how many shares to sell")
  if (shares > held.shares + MIN_SHARES) throw new TradeRejected("You don't own that many shares")

  const remaining = held.shares - shares
  const soldAll = remaining < MIN_SHARES
  return {
    shares: soldAll ? held.shares : shares,
    cashDelta: (soldAll ? held.shares : shares) * trade.price,
    // Cost basis shrinks in proportion, so the gain on what's left stays true.
    position: soldAll ? null : { shares: remaining, costBasis: held.costBasis * (remaining / held.shares) },
  }
}
