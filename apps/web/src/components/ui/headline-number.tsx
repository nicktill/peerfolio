"use client"

import { useLayoutEffect, useRef, useState } from "react"
import { useReducedMotion } from "motion/react"
import { NumberTicker } from "@web/components/magicui/number-ticker"

const seenKey = (id: string) => `peerfolio:counted:${id}`
const hasCounted = (id: string) => {
  try {
    return sessionStorage.getItem(seenKey(id)) === "1"
  } catch {
    return false
  }
}
const markCounted = (id: string) => {
  try {
    sessionStorage.setItem(seenKey(id), "1")
  } catch {
    // Private mode: it just counts again next time.
  }
}

const useBeforePaint = typeof window !== "undefined" ? useLayoutEffect : () => {}

/**
 * A headline figure that counts up the first time it scrolls into view in a session, using Magic UI's
 * Number Ticker, and is plain text on later visits. It starts a little below its value, never from
 * zero, so it doesn't read as a loading state. If the value changes later (a live refresh) the ticker
 * eases to the new number. Reduced motion shows the value as it is.
 *
 * `currency` formats like `formatCurrency`: whole dollars from $10,000, cents below.
 */
export function HeadlineNumber({
  id,
  value,
  currency = false,
  className,
}: {
  id: string
  value: number
  currency?: boolean
  className?: string
}) {
  const reduceMotion = useReducedMotion()
  // "pending" is the server render and the first client render: plain text of the real value.
  const [mode, setMode] = useState<"pending" | "count" | "still">("pending")
  // React's development mode runs mount effects twice; the second run must not undo the first's decision.
  const decided = useRef(false)
  const decimalPlaces = currency ? (Math.abs(value) >= 10_000 ? 0 : 2) : 0
  const text = new Intl.NumberFormat("en-US", { minimumFractionDigits: decimalPlaces, maximumFractionDigits: decimalPlaces }).format(value)

  // Decided before the first paint, and before the ticker mounts (it only reads its starting value once),
  // so the real value never flashes before a count starts.
  useBeforePaint(() => {
    if (decided.current) return
    decided.current = true
    if (reduceMotion || value === 0 || hasCounted(id)) {
      setMode("still")
      return
    }
    markCounted(id)
    setMode("count")
    // Only on mount.
  }, [])

  return (
    <span className={className}>
      {currency ? "$" : null}
      {mode === "pending" ? (
        <span aria-hidden>{text}</span>
      ) : (
        <NumberTicker
          key={mode}
          value={value}
          startValue={mode === "count" ? Math.floor(value * 0.85) : value}
          decimalPlaces={decimalPlaces}
          className="tracking-[inherit] text-inherit dark:text-inherit"
          aria-hidden
        />
      )}
      <span className="sr-only">
        {currency ? "$" : ""}
        {text}
      </span>
    </span>
  )
}
