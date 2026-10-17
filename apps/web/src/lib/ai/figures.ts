import { LIMITS, SECTOR_WATCH, DRAWDOWN_WATCH, type XRay } from "./portfolio-xray.ts"
import { isVisual, type Visual } from "./visuals.ts"

/**
 * Which figure goes with an answer. The model names the kind of figure the question calls for; Peerfolio draws it
 * from the X-Ray's own numbers (the model never supplies data), so the figure always fits the question and always
 * matches the report. "xray" is the full report, kept for broad asks; "none" is a plain-text answer.
 */

export const FIGURES = ["xray", "risk", "sectors", "mix", "donut", "stats", "scenario", "checklist", "performance", "contributors", "holding", "compare", "none"] as const
export type FigureKind = (typeof FIGURES)[number]

const r1 = (v: number) => Math.round(v * 10) / 10
const usd = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`
const name = (h: { ticker: string | null; name: string | null }) => h.ticker ?? h.name ?? "Holding"

type Held = XRay["overview"]["largest"][number]

/** The holdings a question names (by ticker or part of the name), in the order asked; empty when none match. */
export function pickHoldings(x: XRay, focus: string[] | null | undefined): Held[] {
  const wanted = (focus ?? []).map((f) => f.trim().toLowerCase()).filter(Boolean)
  const out: Held[] = []
  for (const w of wanted) {
    const hit = x.overview.largest.find((h) => h.ticker?.toLowerCase() === w) ?? x.overview.largest.find((h) => (h.name ?? "").toLowerCase().includes(w))
    if (hit && !out.includes(hit)) out.push(hit)
  }
  return out.slice(0, 3)
}

const todayOf = (x: XRay, h: Held) => x.performance.movers.find((m) => m.ticker === h.ticker && m.name === h.name)?.todayAmount ?? null

/** The card for one kind of figure, or null when the X-Ray has nothing to draw for it. "xray" and "none" have no card. */
export function figureFor(kind: FigureKind, x: XRay, focus?: string[] | null): Visual | null {
  const { concentration: c, performance: p, sectors } = x
  if (kind === "risk") {
    const bars: Extract<Visual, { kind: "risk" }>["bars"] = [
      { label: "Largest holding", percent: r1(c.top1), line: LIMITS.notableHolding },
      { label: "Top 3 holdings", percent: r1(c.top3), line: null },
      { label: "Top 5 holdings", percent: r1(c.top5), line: LIMITS.notableTop5 },
      { label: "Single stocks", percent: r1(c.singleStockWeight), line: LIMITS.notableStocks },
    ]
    if (sectors.largest) bars.push({ label: sectors.largest.name, percent: r1(sectors.largest.percentOfClassified), line: SECTOR_WATCH })
    if (p.risk?.maxDrawdown != null) bars.push({ label: "Worst drawdown", percent: r1(p.risk.maxDrawdown), line: DRAWDOWN_WATCH })
    return { kind: "risk", bars }
  }
  if (kind === "sectors") {
    const rows = sectors.slices.filter((s) => s.percent > 0).sort((a, b) => b.percent - a.percent).slice(0, 6)
    if (rows.length === 0) return null
    return { kind: "breakdown", title: "By sector", rows: rows.map((s) => ({ name: s.name, percent: r1(s.percent) })), note: sectors.partial ? "Sector data covers only some of your stocks." : null }
  }
  if (kind === "mix") {
    const rows = x.allocation.filter((a) => a.percent > 0).sort((a, b) => b.percent - a.percent).slice(0, 6)
    return rows.length === 0 ? null : { kind: "breakdown", title: "By asset type", rows: rows.map((a) => ({ name: a.name, percent: r1(a.percent) })), note: null }
  }
  if (kind === "donut") {
    const rows = x.allocation.filter((a) => a.percent > 0).sort((a, b) => b.percent - a.percent)
    if (rows.length === 0) return null
    const head = rows.slice(0, 5).map((a) => ({ name: a.name, percent: r1(a.percent) }))
    const rest = rows.slice(5).reduce((n, a) => n + a.percent, 0)
    return { kind: "donut", title: "Where your money sits", slices: rest > 0 ? [...head, { name: "Other", percent: r1(rest) }] : head, centre: { label: "Total", value: usd(x.overview.totalValue) } }
  }
  if (kind === "stats") {
    const stats: Extract<Visual, { kind: "stats" }>["stats"] = [
      { label: "Total value", value: usd(x.overview.totalValue), detail: x.asOf ? `As of ${x.asOf}` : null },
      { label: "Holdings", value: String(x.overview.holdingCount), detail: `${r1(c.effectiveHoldings)} effective` },
      { label: "Largest", value: `${r1(c.top1)}%`, detail: x.overview.largest[0] ? name(x.overview.largest[0]) : null },
      { label: "Single stocks", value: `${r1(c.singleStockWeight)}%`, detail: null },
    ]
    if (p.today?.percent != null) stats.push({ label: "Today", value: `${p.today.percent >= 0 ? "+" : "−"}${Math.abs(p.today.percent).toFixed(2)}%`, detail: null })
    if (p.period) stats.push({ label: `Past ${p.period.range}`, value: `${p.period.percent >= 0 ? "+" : "−"}${Math.abs(p.period.percent).toFixed(1)}%`, detail: `${p.period.days} days` })
    return { kind: "stats", title: "Portfolio at a glance", stats }
  }
  if (kind === "scenario") {
    const h = pickHoldings(x, focus)[0]
    return h
      ? { kind: "scenario", title: "What if it moves?", subject: name(h), base: Math.round(x.overview.totalValue), exposure: r1(h.weight), start: -20 }
      : { kind: "scenario", title: "What if the market moves?", subject: "Whole portfolio", base: Math.round(x.overview.totalValue), exposure: 100, start: -10 }
  }
  if (kind === "checklist") {
    const items = [...x.risks, ...x.nextSteps].slice(0, 5).map((i) => ({ text: i.title, detail: i.summary.slice(0, 160) }))
    return items.length === 0 ? null : { kind: "checklist", title: "Worth a look", items }
  }
  if (kind === "performance") {
    const tiles = [
      { label: "Today", percent: p.today?.percent ?? null, amount: p.today?.amount ?? null },
      ...(p.period ? [{ label: `Past ${p.period.range}`, percent: p.period.percent, amount: null }] : []),
      ...(p.allTime ? [{ label: "Since buying", percent: p.allTime.percent, amount: p.allTime.amount }] : []),
    ]
    return { kind: "performance", tiles, risk: p.risk ? { volatility: p.risk.volatility ?? null, maxDrawdown: p.risk.maxDrawdown ?? null } : null, best: p.risk?.best?.percent ?? null, worst: p.risk?.worst?.percent ?? null }
  }
  if (kind === "contributors") {
    const rows = p.movers.slice(0, 5).map((m) => ({ name: name(m), amount: Math.round(m.todayAmount) }))
    return rows.length === 0 ? null : { kind: "contributors", rows, total: p.today ? Math.round(p.today.amount) : null }
  }
  if (kind === "holding") {
    const h = pickHoldings(x, focus)[0] ?? x.overview.largest[0]
    if (!h) return null
    return { kind: "holding", name: name(h), value: Math.round(h.value), weight: r1(h.weight), line: LIMITS.notableHolding, todayAmount: todayOf(x, h), rank: x.overview.largest.indexOf(h) + 1 }
  }
  if (kind === "compare") {
    const named = pickHoldings(x, focus)
    const rows = (named.length >= 2 ? named : x.overview.largest.slice(0, 3)).map((h) => ({ name: name(h), value: Math.round(h.value), weight: r1(h.weight), todayAmount: todayOf(x, h) }))
    return rows.length < 2 ? null : { kind: "compare", rows }
  }
  return null
}

const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "")
type SpecItem = { label?: unknown; value?: unknown; number?: unknown; detail?: unknown }

/**
 * A figure the model fills in itself (a timeline, a calendar, a checklist, a stat grid or a ring) from the typed spec
 * the show_figure tool takes. Every field is clamped and the result must pass isVisual, otherwise nothing is drawn and
 * the answer stands as plain text.
 */
export function specToFigure(args: Record<string, unknown>): Visual | null {
  const title = clip(args.title, 60)
  const items = (Array.isArray(args.items) ? (args.items as SpecItem[]) : []).filter((i) => i && typeof i === "object").slice(0, 12)
  const detail = (i: SpecItem) => clip(i.detail, 160) || null
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null)
  let card: Visual | null = null
  switch (args.type) {
    case "stats":
      card = { kind: "stats", title, stats: items.slice(0, 9).map((i) => ({ label: clip(i.label, 40), value: clip(i.value, 24), detail: detail(i) })) }
      break
    case "checklist":
      card = { kind: "checklist", title, items: items.slice(0, 10).map((i) => ({ text: clip(i.label, 160), detail: detail(i) })) }
      break
    case "timeline":
      card = { kind: "timeline", title, events: items.slice(0, 8).map((i) => ({ when: clip(i.value, 30), title: clip(i.label, 120), detail: detail(i) })) }
      break
    case "calendar":
      card = { kind: "calendar", title, entries: items.map((i) => ({ date: clip(i.value, 30), label: clip(i.label, 60), amount: num(i.number) })) }
      break
    case "donut":
      card = { kind: "donut", title, slices: items.slice(0, 8).filter((i) => (num(i.number) ?? -1) >= 0).map((i) => ({ name: clip(i.label, 40), percent: r1(num(i.number)!) })), centre: null }
      break
  }
  return card && isVisual(card) ? card : null
}
