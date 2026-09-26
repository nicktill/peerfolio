"use client"

import { cn } from "@web/lib/utils"

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

  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-lg bg-muted p-0.5", className)}>
      {items.map((item) => {
        const selected = item.value === value
        return (
          <button
            key={item.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(item.value)}
            className={cn(
              "rounded-[6px] font-medium transition-colors",
              size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
              selected
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {item.label}
          </button>
        )
      })}
    </div>
  )
}
