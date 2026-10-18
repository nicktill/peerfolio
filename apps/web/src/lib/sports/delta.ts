/** Pure helpers for the "live number" motion: what changed, which way, and how to say it. */

export type Dir = "up" | "down"
export type Delta = { dir: Dir; diff: number }

/** American odds on a line without the dead zone between -100 and +100, so -110 to +100 is a move of 10, not 210. */
export function linearOdds(price: number): number {
  return price > 0 ? price - 100 : price + 100
}

/** Change in an American price. "up" is a longer price: better for the bettor. */
export function priceDelta(prev: number | null | undefined, next: number | null | undefined): Delta | null {
  if (prev == null || next == null || !Number.isFinite(prev) || !Number.isFinite(next) || prev === next) return null
  const diff = linearOdds(next) - linearOdds(prev)
  return diff === 0 ? null : { dir: diff > 0 ? "up" : "down", diff: Math.abs(diff) }
}

/** Change in any plain number (a score, a percent). */
export function numberDelta(prev: number | null | undefined, next: number | null | undefined): Delta | null {
  if (prev == null || next == null || !Number.isFinite(prev) || !Number.isFinite(next) || prev === next) return null
  return { dir: next > prev ? "up" : "down", diff: Math.abs(next - prev) }
}

export type DeltaKind = "price" | "score" | "pct"

export function deltaLabel(d: Delta, kind: DeltaKind): string {
  const n = Math.round(d.diff)
  if (kind === "score") return d.dir === "up" ? `+${n}` : `-${n}`
  return `${d.dir === "up" ? "▲ +" : "▼ -"}${n}${kind === "pct" ? "%" : ""}`
}

/** Colour tone: prices and scores read green when they rise; a falling price is red. Percents stay neutral. */
export function deltaTone(d: Delta, kind: DeltaKind): "good" | "bad" | "flat" {
  if (kind === "pct") return "flat"
  return d.dir === "up" ? "good" : "bad"
}

export type Seen = { v: number; t: number }
/** A remembered value is only worth replaying if it is recent. */
export const SEEN_MAX_AGE_MS = 30 * 60_000
export function freshSeen(seen: Seen | null | undefined, now: number): number | null {
  return seen && Number.isFinite(seen.v) && now - seen.t >= 0 && now - seen.t <= SEEN_MAX_AGE_MS ? seen.v : null
}

/** Whether a change should announce itself to screen readers: at most once per window. */
export function shouldAnnounce(lastAt: number | null, now: number, windowMs = 15_000): boolean {
  return lastAt == null || now - lastAt >= windowMs
}
