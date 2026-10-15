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
export type BenchmarkVisual = { kind: "benchmark"; label: string; range: string; you: number; benchmark: number }

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
  return finite(x.you) && finite(x.benchmark) && typeof x.label === "string"
}

/** Adds a visual, replacing an earlier one of the same kind in the same message. */
export function withVisual(list: Visual[] | undefined, next: Visual): Visual[] {
  return [...(list ?? []).filter((v) => v.kind !== next.kind), next]
}
