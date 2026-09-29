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
