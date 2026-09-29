"use client"

import { cn } from "@web/lib/utils"
import { slideStyle, useSlidingIndicator } from "@web/lib/use-sliding-indicator"

/**
 * Compact single-choice control for time ranges. Rendered as a radiogroup so
 * arrow keys and screen readers behave, unlike a row of styled buttons.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = "default",
  className,
  label,
}: {
  options: readonly T[] | readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  size?: "sm" | "default"
  className?: string
  label: string
}) {
  const items = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o))
  const { containerRef, rect, ready } = useSlidingIndicator<HTMLDivElement>(value)

  return (
    <div ref={containerRef} role="radiogroup" aria-label={label} className={cn("relative inline-flex rounded-lg bg-muted p-0.5", className)}>
      {/* The selected pill glides between options instead of jumping. */}
      <span aria-hidden className="absolute inset-y-0.5 left-0 rounded-[6px] bg-card shadow-sm" style={slideStyle(rect, ready)} />
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            data-slide-key={item.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              "press relative z-10 rounded-[6px] font-medium transition-colors",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              selected ? "text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
