/**
 * Client-side checks for the fantasy trade form, so a typo gets a plain message
 * before a request instead of a validator's "Expected number, received null".
 *
 * Free of imports so the tests can run it directly. The server re-checks every
 * rule; this only makes the mistakes cheap to fix.
 */

/** Keeps digits and a single decimal point, trimmed to `maxDecimals` places. */
export function sanitizeAmount(raw: string, maxDecimals: number): string {
  let cleaned = raw.replace(/[^0-9.]/g, "")
  const dot = cleaned.indexOf(".")
  if (dot !== -1) {
    cleaned = cleaned.slice(0, dot + 1) + cleaned.slice(dot + 1).replace(/\./g, "").slice(0, maxDecimals)
  }
  // "007" reads as 7; "0.5" and "0" are left alone.
  return cleaned.replace(/^0+(?=\d)/, "")
}

export type TradeLimits = {
  /** Cash available to spend. */
  cash: number
  /** Shares of this ticker held, or null when the ticker isn't held. */
  heldShares: number | null
}

export type TradeCheck = { ok: true; value: number | "all" } | { ok: false; message: string }

const money = (v: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(v)
const shares = (v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 4 })

export function checkTradeInput(side: "buy" | "sell", symbol: string, raw: string, { cash, heldShares }: TradeLimits): TradeCheck {
  if (!symbol.trim()) return { ok: false, message: "Enter a ticker, like NVDA." }

  if (side === "buy") {
    const amount = Number(raw)
    if (!raw || !Number.isFinite(amount) || amount < 0.01) return { ok: false, message: "Enter how many dollars to buy." }
    if (amount > cash + 1e-6) return { ok: false, message: `You only have ${money(cash)} to spend.` }
    return { ok: true, value: amount }
  }

  if (heldShares === null || heldShares <= 0) return { ok: false, message: `You don't own any ${symbol.trim().toUpperCase()}.` }
  if (raw === "all") return { ok: true, value: "all" }
  const count = Number(raw)
  if (!raw || !Number.isFinite(count) || count <= 0) return { ok: false, message: "Enter how many shares to sell." }
  if (count > heldShares + 1e-8) return { ok: false, message: `You only hold ${shares(heldShares)} shares.` }
  return { ok: true, value: count }
}

/** Shares a dollar amount buys at a price, or null until both are usable. */
export function estimateShares(amount: number, price: number | null): number | null {
  if (price === null || !(price > 0) || !Number.isFinite(amount) || amount <= 0) return null
  return amount / price
}

/** Quick-pick fractions on the buy slider. 1 is "Max". */
export const BUY_SPOTS = [0.1, 0.25, 0.5, 1] as const
/** Quick-pick fractions on the sell slider. 1 is "All". */
export const SELL_SPOTS = [0.25, 0.5, 0.75, 1] as const

/**
 * Pulls a 0–1 track position onto the nearest hotspot when the pointer is
 * within `threshold` of it. Values between hotspots stay where they are.
 *
 * `held` is the hotspot already caught. It stays caught past the original
 * threshold, so a thumb resting on a point doesn't flicker off from a pixel
 * of pointer noise. Pulling farther lets go.
 */
export function snapFraction(
  fraction: number,
  spots: readonly number[],
  threshold: number,
  held: number | null = null,
): { fraction: number; snapped: boolean } {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0))
  if (held !== null && spots.some((spot) => Math.abs(spot - held) < 1e-9) && Math.abs(clamped - held) <= threshold * 1.75) {
    return { fraction: held, snapped: true }
  }
  let best = clamped
  let bestDist = threshold
  let snapped = false
  for (const spot of spots) {
    const dist = Math.abs(clamped - spot)
    if (dist <= bestDist) {
      best = spot
      bestDist = dist
      snapped = true
    }
  }
  return { fraction: best, snapped }
}

/** Snap distance as a fraction of the track: about 16px, never wider than 4%. */
export function snapThreshold(trackWidthPx: number): number {
  if (!(trackWidthPx > 0)) return 0.04
  return Math.min(0.04, Math.max(0.02, 16 / trackWidthPx))
}

/** Where the slider thumb sits for the current amount field. "all" is the far end. */
export function fractionFromAmount(amount: string, max: number): number {
  if (!(max > 0)) return 0
  if (amount === "all") return 1
  const value = Number(amount)
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.min(1, value / max)
}

/**
 * Amount-field text for a slider position. Buys are dollars to the cent.
 * Selling the whole position is the string "all", which the form already treats
 * as every share rather than a rounded count that can leave a remainder.
 */
export function amountFromFraction(side: "buy" | "sell", fraction: number, max: number, snapped: boolean): string {
  if (!(max > 0) || !(fraction > 0)) return ""
  const clamped = Math.min(1, fraction)
  if (side === "sell" && clamped >= 1) return "all"
  if (side === "buy") {
    const spendable = Math.floor(max * 100) / 100
    const dollars = snapped
      ? Math.floor(spendable * clamped * 100) / 100
      : Math.min(spendable, Math.round(max * clamped * 100) / 100)
    return dollars > 0 ? dollars.toString() : ""
  }
  const shares = Math.min(max, Math.round(max * clamped * 10000) / 10000)
  if (shares <= 0) return ""
  if (shares >= max - 1e-8) return "all"
  return shares.toString()
}
