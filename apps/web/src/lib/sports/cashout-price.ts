/**
 * The one cash-out price formula. Pure. The ticket's Est. P/L, the cash-out quote and the sale all go through `price`, so they always agree.
 */

/** House fee taken off a cash-out. Zero today: an unchanged line returns exactly the stake. Raise it to re-enable a fee. */
export const CASHOUT_FEE = 0

/**
 * What a pick with `totalReturn` is worth at a `probability` chance of winning, in whole credits, never above the total return.
 * Rounds up (a total return is itself floored from stake x odds, so flooring again would shave a credit off an unchanged line).
 */
export const price = (totalReturn: number, probability: number) => {
  const exact = totalReturn * probability * (1 - CASHOUT_FEE)
  // Under a credit it stays under (a sliver of value is not a sale).
  return Math.min(totalReturn, exact < 1 ? Math.floor(exact) : Math.ceil(exact - 1e-9))
}
