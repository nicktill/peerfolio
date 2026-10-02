/**
 * Trading rules for fantasy leagues, as plain functions over numbers.
 *
 * Free of database imports so the tests can run them directly. The database
 * layer loads the member's state under a row lock, asks these functions
 * whether the trade is allowed and what it changes, then writes the result.
 */

import { isTradingSession } from "./market-hours.ts"

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

/**
 * Whether a stock trade placed at `now` waits for the open instead of filling
 * now. Outside the regular session (nights, weekends, holidays, after an early
 * close) the only stock price we have is stale, and the real price keeps moving
 * in extended hours, so filling there would hand out free gains (or losses) to
 * anyone watching a live feed.
 */
export function fillsAtOpen(kind: "stock" | "crypto", now = new Date()): boolean {
  return kind === "stock" && !isTradingSession(now)
}

/**
 * We only have daily crypto prices, never a live one, so every crypto fill
 * would be at a price up to a day old while the coin trades around the clock.
 */
export const CRYPTO_UNAVAILABLE = "Crypto can't be traded in fantasy leagues yet: we don't have live crypto prices."

/** An order that hasn't found a live price in this long is given up on (a halted or delisted stock). */
export const ORDER_EXPIRY_DAYS = 7

export type QueuedFillDecision = { action: "fill" } | { action: "wait" } | { action: "reject" | "cancel"; reason: string }

/**
 * What to do with one queued order at `now`, given the live price we just
 * fetched (`printedAt` is when the trade behind it happened, or null with no
 * live price). It fills only during the regular session and only at a print
 * made after the order was placed, so nobody gets a price they could already
 * see was out of date when they placed it.
 */
export function queuedFillDecision(
  order: { createdAt: Date; leagueEndsAt: Date | null },
  printedAt: Date | null,
  now: Date,
): QueuedFillDecision {
  if (isClosed(order.leagueEndsAt, now)) return { action: "cancel", reason: "The league ended before this could fill" }
  const fresh = isTradingSession(now) && printedAt !== null && printedAt.getTime() >= order.createdAt.getTime()
  if (fresh) return { action: "fill" }
  if (now.getTime() - order.createdAt.getTime() > ORDER_EXPIRY_DAYS * 86_400_000) {
    return { action: "reject", reason: `There was no live price for ${ORDER_EXPIRY_DAYS} days, so it was dropped` }
  }
  return { action: "wait" }
}

/** Most orders one member may have waiting for the open. */
export const MAX_PENDING_ORDERS = 20

export type QueuedOrder = { side: "buy"; amount: number } | { side: "sell"; shares: number | "all" }

/** Cash set aside for buys still waiting for the open. */
export const reservedCash = (orders: { side: "buy" | "sell"; amount: number | null }[]) =>
  orders.reduce((sum, o) => sum + (o.side === "buy" ? (o.amount ?? 0) : 0), 0)

const dollars = (v: number) => v.toLocaleString("en-US", { style: "currency", currency: "USD" })

/**
 * Whether an order can be queued for the open, or why not. Checked against
 * what's on file now; the fill checks again at the open, where cash, holdings
 * and the pick cap are what count.
 *
 * `availableCash` already has queued buys taken out; `queuedSellShares` is what
 * is already queued to sell of this ticker ("all" once a sell-everything is queued).
 */
export function checkQueuedOrder(
  order: QueuedOrder,
  ctx: { availableCash: number; heldShares: number; queuedSellShares: number | "all"; pendingCount: number },
): string | null {
  if (ctx.pendingCount >= MAX_PENDING_ORDERS) return `You have ${MAX_PENDING_ORDERS} orders waiting for the open. Cancel one to queue another.`
  if (order.side === "buy") {
    if (!(order.amount >= MIN_CASH)) return "Enter an amount to buy"
    if (order.amount > ctx.availableCash + 1e-6) return `You have ${dollars(Math.max(0, ctx.availableCash))} to spend after your queued buys`
    return null
  }
  if (ctx.heldShares < MIN_SHARES) return "You don't own any of that yet"
  if (ctx.queuedSellShares === "all") return "You've already queued selling all of it"
  if (order.shares === "all") return null
  if (!(order.shares >= MIN_SHARES)) return "Enter how many shares to sell"
  if (ctx.queuedSellShares + order.shares > ctx.heldShares + MIN_SHARES) {
    return ctx.queuedSellShares > 0 ? "That's more than you hold once your queued sells go through" : "You don't own that many shares"
  }
  return null
}

/** Smallest trade worth recording: a cent of cash or a hundred-millionth of a share. */
const MIN_CASH = 0.01
const MIN_SHARES = 1e-8
/**
 * A remainder smaller than this after a sale is closed out with it. Shared with
 * the ledger replay so the stored book and the nightly check agree on whether a
 * position still exists; anything this small rounds to 0 in the UI anyway.
 */
const DUST_SHARES = 1e-6

export const portfolioValue = (state: MemberState) =>
  state.cash + state.positions.reduce((sum, p) => sum + p.shares * p.price, 0)

/**
 * What "Your picks" shows for one position.
 *
 * `averageCost` comes only from the stored cost basis and share count, so it
 * moves when shares are bought or sold and never with the live quote. Value and
 * gain are the only things the live price feeds.
 */
export function positionStats(position: { shares: number; costBasis: number }, livePrice: number) {
  const averageCost = position.shares > 0 ? position.costBasis / position.shares : 0
  return {
    averageCost,
    value: position.shares * livePrice,
    // (livePrice - averageCost) / averageCost, in percent.
    gainPct: averageCost > 0 ? ((livePrice - averageCost) / averageCost) * 100 : 0,
  }
}

/** How a member's total splits between cash on the bench and money in picks, in percent of the total. */
export function cashSplit(value: number, cash: number) {
  const cashPct = value > 0 ? Math.min(100, Math.max(0, (cash / value) * 100)) : 0
  return { cashPct, investedPct: 100 - cashPct }
}

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
  for (const [id, p] of positions) if (p.shares < DUST_SHARES) positions.delete(id)
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

/**
 * Whether the owner may move a league's end date, as a message for the owner or
 * null when it's fine. The date may only move later, or be removed; an all-time
 * league can't be given an end (that would quietly cut it short).
 */
export function checkEndChange(current: Date | null, next: Date | null, now = new Date()): string | null {
  if (next === null) return null
  if (current === null) return "This league has no end date, so there's nothing to extend"
  if (next.getTime() <= current.getTime()) return "The new end date has to be later than the current one"
  if (next.getTime() < now.getTime() + 60 * 60 * 1000) return "Pick an end date at least an hour away"
  return null
}

/** The race chart line: everyone starts at 100, the last point is the live value. */
export function raceSeries(pastValues: number[], liveValue: number, startingCash: number): number[] {
  return [100, ...pastValues.map((v) => 100 + returnPct(v, startingCash)), 100 + returnPct(liveValue, startingCash)]
}

export function isClosed(endsAt: Date | null, now = new Date()) {
  return endsAt !== null && endsAt.getTime() <= now.getTime()
}

/** A finished league whose final snapshot never landed (a missed nightly run) gets this long to catch up. */
const FINALIZE_WINDOW_DAYS = 3

/** The UTC date of a league's last day. Its final value is the first nightly snapshot dated on or after it. */
const endDate = (endsAt: Date) => endsAt.toISOString().slice(0, 10)

const endedLongAgo = (endsAt: Date, now: Date) => now.getTime() - endsAt.getTime() > FINALIZE_WINDOW_DAYS * 86_400_000

/**
 * What a member is scored at. A running league uses the live value. A finished
 * league uses its final snapshot, the first nightly one dated on or after the
 * end date, so the last day's trades and price moves count. Until that lands
 * the live value stands in: trading is closed by then, so only prices move.
 * Leagues that ended before final snapshots existed keep their last snapshot.
 */
export function scoredValue(endsAt: Date | null, history: { date: string; value: number }[], liveValue: number, now = new Date()): number {
  if (endsAt === null || !isClosed(endsAt, now)) return liveValue
  const last = history.at(-1)
  if (last && (last.date >= endDate(endsAt) || endedLongAgo(endsAt, now))) return last.value
  return liveValue
}

/** Whether tonight's snapshot should include a member: every running league, plus a just-finished one until its final value is in. */
export function wantsSnapshot(endsAt: Date | null, lastSnapshotDate: string | null, now = new Date()): boolean {
  if (endsAt === null || !isClosed(endsAt, now)) return true
  if (endedLongAgo(endsAt, now)) return false
  return lastSnapshotDate === null || lastSnapshotDate < endDate(endsAt)
}

/**
 * Validates a trade and works out what it changes. Throws {@link TradeRejected}
 * with a message fit to show the person.
 */
export function applyTrade(state: MemberState, trade: TradeRequest, rules: { maxPositionPct: number | null; reservedCash?: number }): TradeOutcome {
  if (!(trade.price > 0)) throw new TradeRejected("No price for that ticker yet")
  const held = state.positions.find((p) => p.securityId === trade.securityId)

  if (trade.side === "buy") {
    if (!(trade.amount >= MIN_CASH)) throw new TradeRejected("Enter an amount to buy")
    // Cash set aside for queued buys can't be spent twice; it still counts toward the total for the cap.
    if (trade.amount > state.cash + 1e-6) throw new TradeRejected("Not enough cash for that")
    if (trade.amount > state.cash - (rules.reservedCash ?? 0) + 1e-6) throw new TradeRejected("Not enough cash for that once your queued buys are set aside")

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
  const soldAll = remaining < DUST_SHARES
  return {
    shares: soldAll ? held.shares : shares,
    cashDelta: (soldAll ? held.shares : shares) * trade.price,
    // Cost basis shrinks in proportion, so the gain on what's left stays true.
    position: soldAll ? null : { shares: remaining, costBasis: held.costBasis * (remaining / held.shares) },
  }
}
