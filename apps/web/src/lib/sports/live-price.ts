import { americanToDecimal, americanToProb } from './odds.ts'

/** Small automatic live reprices: at most 3 probability points and 5% less total payout. */
export function acceptsLivePrice(expected: number, current: number): boolean {
  if (![expected, current].every(p => Number.isInteger(p) && Math.abs(p) >= 100)) return false
  return Math.abs(americanToProb(expected) - americanToProb(current)) <= 0.03 + 1e-9
    && americanToDecimal(current) >= americanToDecimal(expected) * 0.95 - 1e-9
}
