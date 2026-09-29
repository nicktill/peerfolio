/**
 * Layout math for the race chart, kept free of React so it can be tested.
 */

/**
 * Round, readable tick values inside [lo, hi] (in the same unit as the data).
 * Steps are 1, 2, 2.5 or 5 times a power of ten, and 0 is always a tick when
 * it's in range, since "0%" is the line everything is measured from.
 */
export function niceTicks(lo: number, hi: number, target = 4): number[] {
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return []
  const raw = (hi - lo) / Math.max(1, target)
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= raw) ?? raw)

  const ticks: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-9; v += step) {
    // Kill float noise such as 0.30000000000000004.
    ticks.push(Number(v.toFixed(10)))
  }
  return ticks
}

/** Decimal places worth showing for tick labels at this spacing. */
export function tickDigits(ticks: number[]): number {
  if (ticks.length < 2) return 1
  const step = Math.abs(ticks[1]! - ticks[0]!)
  return step >= 1 ? 0 : step >= 0.1 ? 1 : 2
}

/**
 * Moves labels apart so none overlap, keeping their order and staying inside
 * [min, max]. Used for the names at the end of each line, which otherwise pile
 * up when two players finish close together.
 */
export function spreadLabels(desired: number[], minGap: number, min: number, max: number): number[] {
  const order = desired.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y)
  const ys = order.map((o) => Math.min(max, Math.max(min, o.y)))

  for (let k = 1; k < ys.length; k++) ys[k] = Math.max(ys[k]!, ys[k - 1]! + minGap)
  // If pushing down ran past the bottom, push back up from there.
  if (ys.length > 0 && ys[ys.length - 1]! > max) {
    ys[ys.length - 1] = max
    for (let k = ys.length - 2; k >= 0; k--) ys[k] = Math.min(ys[k]!, ys[k + 1]! - minGap)
  }

  const out = new Array<number>(desired.length)
  order.forEach((o, k) => {
    out[o.i] = ys[k]!
  })
  return out
}

/** Which point of a series `x` is over, when the series is spread across [left, left + width]. */
export function pointIndexAt(x: number, left: number, width: number, length: number): number {
  if (length <= 1 || width <= 0) return 0
  const fraction = Math.min(1, Math.max(0, (x - left) / width))
  return Math.round(fraction * (length - 1))
}

/** Horizontal position of point `index` of `length`, spread across [left, left + width]. */
export function xAt(index: number, length: number, left: number, width: number): number {
  return length <= 1 ? left + width : left + (index / (length - 1)) * width
}
