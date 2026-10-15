/** Small formatting helpers for Wealth Lab (pure, no React). */

export const usd = (v: number) => `$${Math.round(v).toLocaleString("en-US")}`
export const usdCompact = (v: number) => {
  const a = Math.abs(v)
  if (a >= 1e9) return `$${+(v / 1e9).toFixed(2)}B`
  if (a >= 1e6) return `$${+(v / 1e6).toFixed(2)}M`
  if (a >= 1e4) return `$${Math.round(v / 1e3)}K`
  if (a >= 1e3) return `$${+(v / 1e3).toFixed(1)}K`
  return `$${Math.round(v)}`
}

/** 137 -> "11y 5m"; 12 -> "1y"; 5 -> "5m"; 0 -> "now". */
export function duration(months: number): string {
  const m = Math.max(0, Math.round(months))
  if (m === 0) return "now"
  const y = Math.floor(m / 12)
  const r = m % 12
  return [y ? `${y}y` : "", r ? `${r}m` : ""].filter(Boolean).join(" ")
}

/** Parses "$1,250.5", "1_000", "" -> number | null. */
export function parseNumber(text: string): number | null {
  const cleaned = text.replace(/[$,\s_%]/g, "")
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}
