"use client"

import { useRef } from "react"
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
  const buttons = useRef<Record<string, HTMLButtonElement | null>>({})

  // Radio-group keyboard model: one tab stop, arrows move and select.
  function onKeyDown(e: React.KeyboardEvent) {
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const at = items.findIndex((i) => i.value === value)
    const next = items[(at + step + items.length) % items.length]!
    onChange(next.value)
    buttons.current[next.value]?.focus()
  }

  return (
    <div ref={containerRef} role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("relative inline-flex rounded-lg bg-muted p-0.5", className)}>
      {/* The selected pill glides between options instead of jumping. */}
      <span aria-hidden className="absolute inset-y-0.5 left-0 rounded-[6px] bg-card shadow-sm" style={slideStyle(rect, ready)} />
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            data-slide-key={item.value}
            ref={(el) => {
              buttons.current[item.value] = el
            }}
            tabIndex={selected ? 0 : -1}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              "press relative z-10 rounded-[6px] font-medium transition-colors",
              // Taller on touch screens, where 24px is too small a target.
              size === "sm" ? "min-h-8 px-2.5 py-1 text-xs sm:min-h-7 sm:px-2" : "min-h-9 px-3 py-1.5 text-sm sm:min-h-8",
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
