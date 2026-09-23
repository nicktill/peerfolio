"use client"

import { useState } from "react"
import { cn } from "@web/lib/utils"
import { formatCurrency } from "@web/lib/format"

export type AllocationSlice = { name: string; value: number; percent: number }

/** Categorical slots, assigned in fixed order. Never cycled — see globals.css. */
const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)"]
const OTHER = "hsl(var(--muted-foreground))"

const MAX_SLICES = 6

export function colorForIndex(index: number) {
  return index < SERIES.length ? SERIES[index]! : OTHER
}

/**
 * Part-to-whole as a horizontal stacked bar plus a labelled list.
 *
 * A bar beats a donut here: segments share a baseline so they're directly
 * comparable, long category names fit, and every slice is direct-labelled in
 * the list below — which the palette's light-mode contrast requires anyway.
 *
 * Anything past six categories folds into "Other" rather than inventing a
 * seventh hue that nobody could distinguish.
 */
export function AllocationBar({
  slices,
  hidden = false,
  className,
}: {
  slices: AllocationSlice[]
  hidden?: boolean
  className?: string
}) {
  const [active, setActive] = useState<string | null>(null)

  const head = slices.slice(0, MAX_SLICES)
  const tail = slices.slice(MAX_SLICES)

  const data = tail.length
    ? [
        ...head,
        {
          name: "Other",
          value: tail.reduce((sum, s) => sum + s.value, 0),
          percent: tail.reduce((sum, s) => sum + s.percent, 0),
        },
      ]
    : head

  if (data.length === 0) return null

  return (
    <div className={cn("space-y-4", className)}>
      <div
        className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full"
        role="img"
        aria-label={data.map((s) => `${s.name} ${s.percent.toFixed(0)} percent`).join(", ")}
      >
        {data.map((slice, i) => (
          <div
            key={slice.name}
            className={cn("h-full transition-opacity first:rounded-l-full last:rounded-r-full", {
              "opacity-40": active !== null && active !== slice.name,
            })}
            style={{ width: `${Math.max(slice.percent, 1)}%`, backgroundColor: colorForIndex(i) }}
            onMouseEnter={() => setActive(slice.name)}
            onMouseLeave={() => setActive(null)}
          />
        ))}
      </div>

      <ul className="space-y-2">
        {data.map((slice, i) => (
          <li
            key={slice.name}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-1 py-1 text-sm transition-colors",
              active === slice.name && "bg-secondary",
            )}
            onMouseEnter={() => setActive(slice.name)}
            onMouseLeave={() => setActive(null)}
          >
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: colorForIndex(i) }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate">{slice.name}</span>
            <span className="numeric shrink-0 text-muted-foreground">
              {hidden ? "••" : `${slice.percent.toFixed(1)}%`}
            </span>
            <span className="numeric shrink-0 text-right font-medium sm:w-20">
              {formatCurrency(slice.value, { hidden, compact: true })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
