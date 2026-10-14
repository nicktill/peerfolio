import { visibleReturn } from "./return-display.ts"

type Kind = "stock" | "crypto"

const usd = (value: number, digits: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value)

export function formatShares(quantity: number, kind: Kind): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: kind === "crypto" ? 8 : 2 }).format(quantity)
}

export function formatPrice(price: number): string {
  return usd(price, 2)
}

/** Average cost per share: whole dollars from $100 up, cents below. Null without a cost basis. */
export function formatCost(costBasis: number | null, quantity: number): string | null {
  if (!costBasis || !(quantity > 0)) return null
  const avg = costBasis / quantity
  return usd(avg, avg >= 100 ? 0 : 2)
}

export type GainLabel = { tone: "gain" | "loss" | "flat"; dollars: string; percent: string }

/** Signed dollar and percent gain, or null when there is no cost basis. */
export function gainLabel(value: number, costBasis: number | null): GainLabel | null {
  if (!costBasis) return null
  const gain = value - costBasis
  const percent = visibleReturn((gain / costBasis) * 100)
  const whole = Math.abs(gain) >= 100
  const shown = Number(Math.abs(gain).toFixed(whole ? 0 : 2))
  const sign = shown === 0 ? "" : gain > 0 ? "+" : "−"
  return {
    tone: percent > 0 ? "gain" : percent < 0 ? "loss" : "flat",
    dollars: `${sign}${usd(shown, whole ? 0 : 2)}`,
    percent: `${percent > 0 ? "+" : percent < 0 ? "−" : ""}${Math.abs(percent).toFixed(2)}%`,
  }
}

/** Plain-text tooltip with every detail the row may truncate. */
export function positionTitle(p: { ticker: string | null; name: string | null; quantity: number; kind: Kind; price: number; value: number; costBasis: number | null }): string {
  const parts = [[p.ticker, p.name].filter(Boolean).join(" · ") || "Holding", `${formatShares(p.quantity, p.kind)} ${p.kind === "crypto" ? "units" : "shares"}`]
  if (p.price > 0) parts.push(`price ${formatPrice(p.price)}`)
  const cost = formatCost(p.costBasis, p.quantity)
  parts.push(cost ? `avg cost ${cost}` : "no cost basis")
  const g = gainLabel(p.value, p.costBasis)
  if (g) parts.push(`gain ${g.dollars} (${g.percent})`)
  return parts.join(" · ")
}
