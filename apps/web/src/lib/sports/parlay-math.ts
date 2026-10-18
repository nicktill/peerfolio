import { americanToDecimal } from "./odds.ts"

/**
 * Slip preview maths for parlays. The server prices and settles every parlay; this only shows what the slip is about to ask for,
 * using the same rule as a single pick: decimal odds multiply, and the return is rounded down to a whole credit.
 */

/** Product of the legs' decimal odds; null when there are no legs. */
export function combinedDecimal(prices: number[]): number | null {
  if (prices.length === 0) return null
  let product = 1
  for (const p of prices) {
    if (!Number.isFinite(p) || p === 0 || Math.abs(p) < 100) return null
    product *= americanToDecimal(p)
  }
  return product
}

/** Decimal odds back to American, rounded to a whole number (2.0 is +100, below that is negative). */
export function decimalToAmerican(decimal: number): number {
  if (!(decimal > 1)) return 0
  return decimal >= 2 ? Math.round((decimal - 1) * 100) : Math.round(-100 / (decimal - 1))
}

export type ParlayQuote = { decimal: number; american: number; totalReturn: number; toWin: number }

/** Combined odds and, for a whole-credit stake, the total return and profit. Null until there is at least one valid leg. */
export function parlayQuote(prices: number[], stake = 0): ParlayQuote | null {
  const decimal = combinedDecimal(prices)
  if (decimal == null) return null
  const amount = Math.max(0, Math.floor(stake))
  const totalReturn = Math.floor(amount * decimal + 1e-9)
  return { decimal, american: decimalToAmerican(decimal), totalReturn, toWin: Math.max(0, totalReturn - amount) }
}
