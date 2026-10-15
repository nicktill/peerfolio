import { summarizeHoldings, todayChange, type PositionInput } from "../dashboard-math.ts"

/**
 * A few lines about the person's portfolio, handed to the model with every question so common ones
 * ("how am I doing today", "what's my biggest position") need no tool call. Only figures computed by
 * Peerfolio's own math; the model is still told to quote, not recalculate. Pure, so it can be tested.
 */

const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(2)}%`

export function portfolioBrief(positions: PositionInput[], top = 5, showDollars = true): string {
  const rows = summarizeHoldings(positions)
  if (rows.length === 0) return "They have no priced holdings yet."
  const total = rows.reduce((s, r) => s + r.value, 0)
  const today = todayChange(positions, total)
  // With web search on, dollar amounts stay out of the prompt: percentages carry the picture and nothing sizeable can leak into a query.
  const lines = [
    `Their portfolio (stored prices, refreshed about every 2 minutes while the market is open): ${showDollars ? `${usd(total)} across ` : ""}${rows.length} holdings.`,
    !today
      ? "Today's move isn't known yet."
      : showDollars
        ? `Today so far: ${today.amount >= 0 ? "+" : "−"}${usd(Math.abs(today.amount))} (${today.percent == null ? "n/a" : pct(today.percent)}).`
        : `Today so far: ${today.percent == null ? "n/a" : pct(today.percent)}.`,
    `Largest: ${rows
      .slice(0, top)
      .map((r) => `${r.ticker ?? r.name ?? "?"} ${r.weight.toFixed(1)}%${r.todayPercent != null ? ` (${pct(r.todayPercent)} today)` : ""}`)
      .join(", ")}.`,
  ]
  return lines.join("\n")
}
