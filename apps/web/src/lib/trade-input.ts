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
