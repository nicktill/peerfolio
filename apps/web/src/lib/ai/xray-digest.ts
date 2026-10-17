import type { XRay } from "./portfolio-xray.ts"
import { flagsOf } from "./xray-view.ts"

/**
 * What the model reads of an X-Ray: a digest, not the report. The screen draws the full report; the model only
 * needs the headline, the few things that matter and the numbers to quote, so answers start from the insight
 * instead of a wall of figures (and each turn costs fewer tokens). Every value is copied from the X-Ray, never recomputed.
 */

const r1 = (v: number) => Math.round(v * 10) / 10
const r2 = (v: number) => Math.round(v * 100) / 100

export function digestXRay(x: XRay) {
  const { overview, concentration: c, performance: p, sectors } = x
  return {
    asOf: x.asOf,
    totalValue: Math.round(overview.totalValue),
    holdings: overview.holdingCount,
    today: p.today ? { percent: p.today.percent == null ? null : r2(p.today.percent), amount: Math.round(p.today.amount) } : null,
    period: p.period ? { percent: r2(p.period.percent), days: p.period.days, range: p.period.range } : null,
    sinceBuying: p.allTime ? { percent: p.allTime.percent == null ? null : r2(p.allTime.percent), coveragePercent: r1(p.allTime.coverage) } : null,
    largest: overview.largest.slice(0, 5).map((h) => ({ name: h.ticker ?? h.name, weightPercent: r1(h.weight) })),
    mix: [...x.allocation].sort((a, b) => b.percent - a.percent).slice(0, 4).map((a) => ({ name: a.name, percent: r1(a.percent) })),
    concentration: { top1Percent: r1(c.top1), top3Percent: r1(c.top3), top5Percent: r1(c.top5), singleStocksPercent: r1(c.singleStockWeight), effectiveHoldings: r1(c.effectiveHoldings) },
    topSector: sectors.largest ? { name: sectors.largest.name, percentOfClassifiedStocks: r1(sectors.largest.percentOfClassified), coveragePercent: sectors.coverage == null ? null : r1(sectors.coverage) } : null,
    risk: p.risk ? { volatilityPercent: p.risk.volatility == null ? null : r1(p.risk.volatility), maxDrawdownPercent: p.risk.maxDrawdown == null ? null : r1(p.risk.maxDrawdown) } : null,
    // Worth-a-look items, most serious first, one sentence each. Their follow-up prompts stay on screen.
    flags: flagsOf(x).slice(0, 3).map((f) => ({ title: f.title, severity: f.severity, metric: f.metric, why: f.explanation })),
    movers: p.movers.slice(0, 3).map((m) => ({ name: m.ticker ?? m.name, todayAmount: Math.round(m.todayAmount) })),
    caveats: x.limitations.slice(0, 3),
  }
}

export type XRayDigest = ReturnType<typeof digestXRay>
