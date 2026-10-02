/**
 * Rounds a list of percentages for display so the rounded parts add up to the
 * rounded total, instead of four 25.4%s showing as 25% each and 25.6% as 26%
 * (101%). Largest remainder: everything is rounded down, then the leftover
 * units go to the values that lost the most. Display only; the underlying
 * weights are untouched.
 */
export function roundToTotal(values: number[], decimals = 0): number[] {
  const scale = 10 ** decimals
  const scaled = values.map((v) => v * scale)
  const floors = scaled.map((v) => Math.floor(v))
  const target = Math.round(scaled.reduce((sum, v) => sum + v, 0))
  let leftover = target - floors.reduce((sum, v) => sum + v, 0)

  const byRemainder = scaled.map((v, i) => ({ i, rem: v - floors[i] })).sort((a, b) => b.rem - a.rem)
  for (const { i } of byRemainder) {
    if (leftover <= 0) break
    floors[i] += 1
    leftover -= 1
  }

  return floors.map((v) => v / scale)
}

/** Pairs each item with its display percent from {@link roundToTotal}, so a row of picks adds up the way the real weights do. */
export function withShownWeights<T extends { weight: number }>(items: T[], decimals = 0): (T & { shownWeight: string })[] {
  const shown = roundToTotal(
    items.map((item) => item.weight),
    decimals,
  )
  return items.map((item, i) => ({ ...item, shownWeight: shown[i].toFixed(decimals) }))
}
