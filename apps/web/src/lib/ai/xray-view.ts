import { LIMITS, SECTOR_WATCH, DRAWDOWN_WATCH, type Insight, type XRay } from "./portfolio-xray.ts"

/**
 * What the X-Ray screen says in words, derived from the report's own numbers: a one-sentence verdict, a
 * short line and a "where it sits against its line" reading for each flag, and the follow-up questions.
 * Derived here, not stored, so reports saved earlier read the same way. Pure, so it can be tested.
 */

const pct = (n: number) => `${n.toFixed(1)}%`
const label = (h: { ticker: string | null; name: string | null }) => h.ticker ?? h.name ?? "your largest holding"

/** One plain sentence: what the portfolio is made of, and the one thing that stands out most. */
export function verdictOf(x: XRay): string {
  const { allocation, concentration: c, sectors, overview } = x
  const parts = [...allocation].sort((a, b) => b.percent - a.percent)
  const lead = parts[0]
  const name = (n: string) => n.toLowerCase()
  const makeup = !lead
    ? "Your portfolio"
    : lead.percent >= 60
      ? `Mostly ${name(lead.name)} (${Math.round(lead.percent)}%)`
      : parts.length > 1
        ? `Spread across ${name(lead.name)} (${Math.round(lead.percent)}%) and ${name(parts[1]!.name)} (${Math.round(parts[1]!.percent)}%)`
        : `All ${name(lead.name)}`
  const top = overview.largest[0]
  const topPart = top && c.top1 >= LIMITS.watchHolding ? `, with ${label(top)} making up ${pct(c.top1)} on its own` : ""
  const sector =
    sectors.largest && sectors.largest.percentOfClassified >= SECTOR_WATCH ? ` ${sectors.largest.name} leads the stocks that have sector data.` : ""
  return `${makeup}${topPart}.${sector}`
}

export type Threshold = { value: number; line: number; unit: "%" }
export type FlagView = { id: string; title: string; subtitle: string; metric: string | null; threshold: Threshold | null; explanation: string; followUp: string; severity: Insight["severity"] }

/** The line each flag is judged against, and what the figure is today. Rules of thumb, and the screen says so. */
export function flagsOf(x: XRay): FlagView[] {
  const { concentration: c, sectors, performance } = x
  const ctx: Record<string, { subtitle: string; threshold: Threshold | null }> = {
    "single-holding": { subtitle: "One position drives much of your result", threshold: { value: c.top1, line: LIMITS.notableHolding, unit: "%" } },
    "top-five": { subtitle: "Your five largest are most of it", threshold: { value: c.top5, line: LIMITS.watchTop5, unit: "%" } },
    "single-stocks": { subtitle: "Funds hold more companies per dollar", threshold: { value: c.singleStockWeight, line: LIMITS.notableStocks, unit: "%" } },
    "sector-tilt": {
      subtitle: sectors.partial ? "Only the stocks with sector data" : "Share of your stocks",
      threshold: sectors.largest ? { value: sectors.largest.percentOfClassified, line: SECTOR_WATCH, unit: "%" } : null,
    },
    drawdown: { subtitle: "Net of deposits", threshold: performance.risk?.maxDrawdown != null ? { value: performance.risk.maxDrawdown, line: DRAWDOWN_WATCH, unit: "%" } : null },
    "few-holdings": { subtitle: "Each one matters a lot", threshold: null },
  }
  const rank = { notable: 0, watch: 1, info: 2 } as const
  return [...x.risks]
    .sort((a, b) => rank[a.severity] - rank[b.severity])
    .map((r) => {
      const known = ctx[r.id]
      return {
        id: r.id,
        title: r.title,
        subtitle: known?.subtitle ?? "",
        metric: known?.threshold ? pct(known.threshold.value) : (r.metric ?? null),
        threshold: known?.threshold ?? null,
        explanation: r.summary,
        followUp: r.followUp,
        severity: r.severity,
      }
    })
}

/** Two or three questions worth asking next, from the flags first and then the suggestions, without repeats. */
export function chipsOf(x: XRay, max = 3): string[] {
  const all = [...x.risks, ...x.nextSteps].map((i) => i.followUp)
  return [...new Set(all)].slice(0, max)
}
