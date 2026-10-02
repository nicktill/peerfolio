import { visibleReturn } from "./return-display"

/** Formatting helpers. Every numeric string here is meant to render in `.numeric`. */

export function formatCurrency(value: number, { hidden = false, compact = false } = {}): string {
  if (hidden) return "••••••"

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: compact && Math.abs(value) >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: Math.abs(value) >= 10_000 || compact ? 0 : 2,
  }).format(value)
}

/** Always signed — the sign is the accessible half of a red/green pair. */
export function formatPercent(value: number, digits = 2): string {
  value = visibleReturn(value, digits)
  const sign = value > 0 ? "+" : value < 0 ? "−" : ""
  return `${sign}${Math.abs(value).toFixed(digits)}%`
}


/**
 * A bare YYYY-MM-DD is a calendar day, not an instant. `new Date("2026-09-30")`
 * is UTC midnight, which every US timezone renders as the day before, so those
 * are read at local noon instead.
 */
export function formatDate(date: string | Date, style: "short" | "medium" = "medium"): string {
  const d = typeof date === "string" ? new Date(/^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T12:00:00` : date) : date
  return new Intl.DateTimeFormat("en-US", {
    month: style === "short" ? "numeric" : "short",
    day: "numeric",
    ...(style === "medium" ? { year: "numeric" } : {}),
  }).format(d)
}

export function formatRelativeTime(date: string | Date | null): string {
  if (!date) return "never"

  const d = typeof date === "string" ? new Date(date) : date
  const seconds = Math.round((Date.now() - d.getTime()) / 1000)

  if (seconds < 60) return "just now"
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`
  return formatDate(d)
}

