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

/** Concentration measures, each with the rule-of-thumb line it is judged against (null when there is none). */
export type RiskVisual = { kind: "risk"; bars: { label: string; percent: number; line: number | null }[] }
/** A share-of-portfolio breakdown: sectors or asset classes. */
export type BreakdownVisual = { kind: "breakdown"; title: string; rows: { name: string; percent: number }[]; note: string | null }
/** Returns at a glance: each tile is a window, `percent` null when it can't be computed. */
export type PerformanceVisual = {
  kind: "performance"
  tiles: { label: string; percent: number | null; amount: number | null }[]
  risk: { volatility: number | null; maxDrawdown: number | null } | null
  best: number | null
  worst: number | null
}
/** What moved the portfolio today, in dollars. */
export type ContributorsVisual = { kind: "contributors"; rows: { name: string; amount: number }[]; total: number | null }
/** One holding up close. */
export type HoldingVisual = { kind: "holding"; name: string; value: number; weight: number; line: number; todayAmount: number | null; rank: number }
/** Two or three holdings side by side. */
export type CompareVisual = { kind: "compare"; rows: { name: string; value: number; weight: number; todayAmount: number | null }[] }

/** Allocation as a ring; `centre` is the headline inside it. */
export type DonutVisual = { kind: "donut"; title: string; slices: { name: string; percent: number }[]; centre: { label: string; value: string } | null }
/** A grid of labelled figures. Values are display strings, already formatted. */
export type StatsVisual = { kind: "stats"; title: string; stats: { label: string; value: string; detail: string | null }[] }
/** A what-if slider: the person drags a percent move and sees the effect on `base` through the `exposure` share of it. */
export type ScenarioVisual = { kind: "scenario"; title: string; subject: string; base: number; exposure: number; start: number }
/** Things to do or check, which the person can tick off. */
export type ChecklistVisual = { kind: "checklist"; title: string; items: { text: string; detail: string | null }[] }
/** Dated steps in order. */
export type TimelineVisual = { kind: "timeline"; title: string; events: { when: string; title: string; detail: string | null }[] }
/** Dated entries with an optional amount, e.g. expected dividends. */
export type CalendarVisual = { kind: "calendar"; title: string; entries: { date: string; label: string; amount: number | null }[] }

export type Visual = DonutVisual | StatsVisual | ScenarioVisual | ChecklistVisual | TimelineVisual | CalendarVisual | MarketVisual | MoversVisual | EarningsVisual | BenchmarkVisual | RiskVisual | BreakdownVisual | PerformanceVisual | ContributorsVisual | HoldingVisual | CompareVisual

const KINDS = new Set(["market", "movers", "earnings", "benchmark", "risk", "breakdown", "performance", "contributors", "holding", "compare", "donut", "stats", "scenario", "checklist", "timeline", "calendar"])
const isArr = (v: unknown, n = 12): v is Record<string, unknown>[] => Array.isArray(v) && v.length <= n && v.every((r) => !!r && typeof r === "object")
const str = (v: unknown, max = 200): v is string => typeof v === "string" && v.length > 0 && v.length <= max
const optStr = (v: unknown) => v === null || (typeof v === "string" && v.length <= 300)
const optNum = (v: unknown) => v === null || finite(v)
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/** Only a well-formed visual is ever drawn, whatever arrives. */
export function isVisual(v: unknown): v is Visual {
  if (!v || typeof v !== "object") return false
  const x = v as Record<string, unknown>
  if (typeof x.kind !== "string" || !KINDS.has(x.kind)) return false
  if (x.kind === "market") return Array.isArray(x.indexes) && Array.isArray(x.sectors) && x.indexes.every((i) => finite((i as { dayPercent?: unknown }).dayPercent))
  if (x.kind === "movers") return Array.isArray(x.gainers) && Array.isArray(x.losers)
  if (x.kind === "earnings") return Array.isArray(x.days)
  if (x.kind === "risk") return isArr(x.bars) && x.bars.every((b) => typeof b.label === "string" && finite(b.percent) && optNum(b.line))
  if (x.kind === "breakdown") return typeof x.title === "string" && isArr(x.rows) && x.rows.every((r) => typeof r.name === "string" && finite(r.percent))
  if (x.kind === "performance") return isArr(x.tiles, 4) && x.tiles.every((t) => typeof t.label === "string" && optNum(t.percent) && optNum(t.amount)) && optNum(x.best) && optNum(x.worst)
  if (x.kind === "contributors") return isArr(x.rows) && x.rows.every((r) => typeof r.name === "string" && finite(r.amount)) && optNum(x.total)
  if (x.kind === "holding") return typeof x.name === "string" && finite(x.value) && finite(x.weight) && finite(x.line) && finite(x.rank) && optNum(x.todayAmount)
  if (x.kind === "compare") return isArr(x.rows, 3) && x.rows.every((r) => typeof r.name === "string" && finite(r.value) && finite(r.weight) && optNum(r.todayAmount))
  if (x.kind === "donut") return str(x.title) && isArr(x.slices, 8) && x.slices.length > 0 && x.slices.every((r) => str(r.name, 60) && finite(r.percent) && r.percent >= 0) && (x.centre === null || (!!x.centre && str((x.centre as Record<string, unknown>).label, 40) && str((x.centre as Record<string, unknown>).value, 40)))
  if (x.kind === "stats") return str(x.title) && isArr(x.stats, 9) && x.stats.length > 0 && x.stats.every((r) => str(r.label, 60) && str(r.value, 40) && optStr(r.detail))
  if (x.kind === "scenario") return str(x.title) && str(x.subject, 60) && finite(x.base) && x.base >= 0 && finite(x.exposure) && x.exposure >= 0 && x.exposure <= 100 && finite(x.start)
  if (x.kind === "checklist") return str(x.title) && isArr(x.items, 10) && x.items.length > 0 && x.items.every((r) => str(r.text) && optStr(r.detail))
  if (x.kind === "timeline") return str(x.title) && isArr(x.events, 8) && x.events.length > 0 && x.events.every((r) => str(r.when, 40) && str(r.title) && optStr(r.detail))
  if (x.kind === "calendar") return str(x.title) && isArr(x.entries, 12) && x.entries.length > 0 && x.entries.every((r) => str(r.date, 40) && str(r.label, 80) && optNum(r.amount))
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

/** What makes two cards "the same one again": the kind, plus the subject for cards that come in several flavours. */
export function visualKey(v: Visual): string {
  if ("title" in v && v.kind !== "breakdown") return `${v.kind}:${v.title}`
  return v.kind === "breakdown" ? `breakdown:${v.title}` : v.kind === "holding" ? `holding:${v.name}` : v.kind === "compare" ? `compare:${v.rows.map((r) => r.name).join("+")}` : v.kind
}
