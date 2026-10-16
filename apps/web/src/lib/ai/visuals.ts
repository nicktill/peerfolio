/**
 * Small visual summaries a tool can hand to the chat window, drawn by Peerfolio from the tool's own numbers
 * (the model never draws or restates them). Kept few and compact: a visual only appears when a tool returns
 * data with a natural shape, next to a short written answer, never instead of one.
 */

export type MarketVisual = {
  kind: "market"
  session: string
  indexes: { name: string; dayPercent: number }[]
  sectors: { name: string; dayPercent: number }[]
}
export type MoversVisual = {
  kind: "movers"
  gainers: { symbol: string; changePercent: number; held: boolean }[]
  losers: { symbol: string; changePercent: number; held: boolean }[]
}
export type EarningsVisual = {
  kind: "earnings"
  days: { day: string; reports: { symbol: string; when: string; held: boolean }[] }[]
}
/** `lines` are the two series indexed to 100 on the first day, thinned for drawing; optional so older results still draw. */
export type BenchmarkVisual = { kind: "benchmark"; label: string; range: string; you: number; benchmark: number; lines?: { you: number[]; bench: number[] } }

export type Visual = MarketVisual | MoversVisual | EarningsVisual | BenchmarkVisual

const KINDS = new Set(["market", "movers", "earnings", "benchmark"])
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Only a well-formed visual is ever drawn, whatever arrives. */
export function isVisual(v: unknown): v is Visual {
  if (!v || typeof v !== "object") return false
  const x = v as Record<string, unknown>
  if (typeof x.kind !== "string" || !KINDS.has(x.kind)) return false
  if (x.kind === "market") return Array.isArray(x.indexes) && Array.isArray(x.sectors) && x.indexes.every((i) => finite((i as { dayPercent?: unknown }).dayPercent))
  if (x.kind === "movers") return Array.isArray(x.gainers) && Array.isArray(x.losers)
  if (x.kind === "earnings") return Array.isArray(x.days)
  const lines = x.lines as { you?: unknown; bench?: unknown } | undefined
  const okLine = (l: unknown) => Array.isArray(l) && l.length >= 2 && l.length <= 80 && l.every(finite)
  if (lines !== undefined && !(okLine(lines?.you) && okLine(lines?.bench))) return false
  return finite(x.you) && finite(x.benchmark) && typeof x.label === "string"
}

/** At most `n` evenly spaced values, always keeping the first and the last. */
export function thin(values: number[], n = 36): number[] {
  if (values.length <= n) return values
  return Array.from({ length: n }, (_, i) => values[Math.round((i * (values.length - 1)) / (n - 1))]!)
}

/** An SVG path through `values`, scaled into a w by h box between `min` and `max` (higher values sit higher). */
export function linePath(values: number[], min: number, max: number, w = 100, h = 40): string {
  const span = max - min || 1
  return values.map((v, i) => `${i === 0 ? "M" : "L"}${((i / Math.max(1, values.length - 1)) * w).toFixed(2)} ${(h - ((v - min) / span) * h).toFixed(2)}`).join(" ")
}

/** A reply carries at most this many cards: more than two stops being a visual and becomes a dashboard. */
export const MAX_VISUALS = 2

/** Adds a visual, replacing an earlier one of the same kind in the same message and keeping only the newest few. */
export function withVisual(list: Visual[] | undefined, next: Visual): Visual[] {
  return [...(list ?? []).filter((v) => v.kind !== next.kind), next].slice(-MAX_VISUALS)
}
