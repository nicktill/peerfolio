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

export type EndItem = { id: string; label: string; isYou: boolean; value: number; y: number }
export type EndGroup = { ids: string[]; names: string[]; value: number; y: number; hasYou: boolean }

/**
 * Lines that finish on the same displayed return share one end label.
 *
 * Two labels for the same number can't both sit next to their own dot, so one
 * gets pushed off to make room, next to somebody else's dot, and reads as that
 * person's result. One label naming both can't be misread. Groups come back top
 * to bottom, and within a group "You" is listed first.
 */
export function groupEndLabels(items: EndItem[], digits = 2): EndGroup[] {
  const shown = (v: number) => {
    const rounded = Number(Math.abs(v).toFixed(digits))
    return rounded === 0 ? 0 : Math.sign(v) * rounded
  }
  const byValue = new Map<number, EndItem[]>()
  for (const item of items) {
    const key = shown(item.value)
    byValue.set(key, [...(byValue.get(key) ?? []), item])
  }
  return [...byValue.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([value, members]) => {
      const ordered = [...members.filter((m) => m.isYou), ...members.filter((m) => !m.isYou)]
      return {
        ids: ordered.map((m) => m.id),
        names: ordered.map((m) => (m.isYou ? "You" : m.label)),
        value,
        y: members.reduce((sum, m) => sum + m.y, 0) / members.length,
        hasYou: members.some((m) => m.isYou),
      }
    })
}

/** A group's name as it fits: "Bennett", "You · Andri", or "3 tied" when the names can't all fit. */
export function groupName(names: string[], maxChars: number): string {
  const clip = (n: string) => (n.length > maxChars ? `${n.slice(0, Math.max(1, maxChars - 1))}…` : n)
  if (names.length === 1) return clip(names[0]!)
  const joined = names.join(" · ")
  return joined.length <= maxChars ? joined : `${names.length} tied`
}

/**
 * A smooth SVG path through points with increasing x, as a monotone cubic
 * (Fritsch-Carlson). Unlike a plain spline it never overshoots: between two
 * readings the curve stays between them, and a flat stretch stays flat, so the
 * smoothing can't invent a dip or a peak that the data doesn't have.
 */
export function monotonePath(points: readonly (readonly [number, number])[]): string {
  const n = points.length
  if (n === 0) return ""
  const f = (v: number) => v.toFixed(2)
  const [x0, y0] = points[0]!
  if (n === 1) return `M${f(x0)},${f(y0)}`
  if (n === 2) return `M${f(x0)},${f(y0)} L${f(points[1]![0])},${f(points[1]![1])}`

  const dx: number[] = []
  const slope: number[] = []
  for (let i = 0; i < n - 1; i++) {
    const w = points[i + 1]![0] - points[i]![0]
    dx.push(w)
    slope.push(w === 0 ? 0 : (points[i + 1]![1] - points[i]![1]) / w)
  }

  const tangent = new Array<number>(n)
  tangent[0] = slope[0]!
  tangent[n - 1] = slope[n - 2]!
  for (let i = 1; i < n - 1; i++) tangent[i] = slope[i - 1]! * slope[i]! <= 0 ? 0 : (slope[i - 1]! + slope[i]!) / 2

  // Limit each tangent so no segment's curve leaves the range of its two ends.
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      tangent[i] = 0
      tangent[i + 1] = 0
      continue
    }
    const a = tangent[i]! / slope[i]!
    const b = tangent[i + 1]! / slope[i]!
    const s = a * a + b * b
    if (s > 9) {
      const tau = 3 / Math.sqrt(s)
      tangent[i] = tau * a * slope[i]!
      tangent[i + 1] = tau * b * slope[i]!
    }
  }

  let d = `M${f(x0)},${f(y0)}`
  for (let i = 0; i < n - 1; i++) {
    const [xa, ya] = points[i]!
    const [xb, yb] = points[i + 1]!
    const w = dx[i]! / 3
    d += ` C${f(xa + w)},${f(ya + tangent[i]! * w)} ${f(xb - w)},${f(yb - tangent[i + 1]! * w)} ${f(xb)},${f(yb)}`
  }
  return d
}
