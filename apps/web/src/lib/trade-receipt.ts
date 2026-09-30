/** What a finished trade means for the person who made it, for the receipt that pops up. */
export function tradeReceipt({ side, shares, price, averageCost }: { side: "buy" | "sell"; shares: number; price: number; averageCost: number | null }) {
  const value = shares * price
  // A sale locks in the gap between the fill and what the shares cost on average.
  const hasBasis = side === "sell" && averageCost !== null && averageCost > 0
  const realized = hasBasis ? shares * (price - averageCost) : null
  const realizedPct = hasBasis ? ((price - averageCost) / averageCost) * 100 : null
  // Whole cents, so rounding noise on a flat exit doesn't read as a win or a loss.
  const cents = realized === null ? null : Math.round(realized * 100) / 100
  const outcome: "win" | "loss" | "flat" | null = cents === null ? null : cents > 0 ? "win" : cents < 0 ? "loss" : "flat"
  return { value, realized, realizedPct, outcome }
}
